import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../../db';
import { publish } from '../../../shared/outbox';
import { newId, type OtpId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { phoneOtps, phoneRegistryHistory, users } from './schema';
import { hashPassword } from './password-hash';
import { hashPhone } from './phone-hash';
import { storeDevOtpCode } from './dev-verification';
import { validateDisplayName, validateEmail, validatePassword } from '../domain/password-policy';
import { normalizePhoneE164, validatePhone } from '../domain/phone-policy';
import { generateOtpCode, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../domain/otp-policy';
import { hashPassword as hashOtpCode, verifyPassword as verifyOtpCode } from './password-hash';
import { recordTermsAcceptance } from './terms-acceptance';

export type RegisterProviderInput = {
	email: string;
	password: string;
	displayName: string;
	phone: string;
	acceptedTerms: boolean;
};

export type RegisterProviderResult = {
	userId?: UserId;
	otpSent: boolean;
	otpId?: OtpId;
	accountCreated: boolean;
};

export async function registerProvider(
	db: Database,
	input: RegisterProviderInput,
	now: Date,
	correlationId: string
): Promise<Result<RegisterProviderResult, UseCaseError>> {
	const issues: Array<{ path: string; message: string }> = [];
	if (!input.acceptedTerms) {
		issues.push({ path: 'acceptedTerms', message: 'You must accept the terms.' });
	}
	const emailErr = validateEmail(input.email);
	if (emailErr) issues.push({ path: 'email', message: emailErr });
	const passwordErr = validatePassword(input.password);
	if (passwordErr) issues.push({ path: 'password', message: passwordErr });
	const nameErr = validateDisplayName(input.displayName);
	if (nameErr) issues.push({ path: 'displayName', message: nameErr });
	const phoneErr = validatePhone(input.phone);
	if (phoneErr) issues.push({ path: 'phone', message: phoneErr });
	if (issues.length) return Err({ kind: 'validation_failed', issues });

	const normalizedEmail = input.email.trim().toLowerCase();
	const normalizedPhone = normalizePhoneE164(input.phone)!;

	const existingEmail = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	if (existingEmail.length > 0) {
		return Ok({ otpSent: true, accountCreated: false });
	}

	const existingPhone = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.phone, normalizedPhone), eq(users.status, 'active')))
		.limit(1);

	if (existingPhone.length > 0) {
		return Err({ kind: 'conflict', reason: 'That mobile number is already registered.' });
	}

	const passwordHash = await hashPassword(input.password);
	const userId = newId<'UserId'>();
	const otpId = newId<'OtpId'>();
	const rawCode = generateOtpCode();
	const codeHash = await hashOtpCode(rawCode);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({
			id: userId,
			email: normalizedEmail,
			phone: normalizedPhone,
			passwordHash,
			displayName: input.displayName.trim(),
			status: 'active'
		});

		await tx.insert(phoneOtps).values({
			id: otpId,
			userId,
			phone: normalizedPhone,
			codeHash,
			purpose: 'register',
			expiresAt: new Date(now.getTime() + OTP_TTL_MS)
		});

		await recordTermsAcceptance(tx, userId, now);

		const event: DomainEvent<'UserRegistered', { userId: string; registrationIntent: string }> = {
			eventId: newId(),
			eventName: 'UserRegistered',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { userId, registrationIntent: 'provider' }
		};
		await publish(tx, event);
	});

	storeDevOtpCode(otpId, rawCode);

	return Ok({
		userId,
		otpSent: true,
		otpId,
		accountCreated: true
	});
}

export type RequestOtpInput = {
	userId: UserId;
	phone: string;
	purpose: 'register' | 'phone_change';
};

export type RequestOtpResult = {
	otpId: OtpId;
	expiresInSeconds: number;
};

export async function requestOtp(
	db: Database,
	input: RequestOtpInput,
	now: Date
): Promise<Result<RequestOtpResult, UseCaseError>> {
	const phoneErr = validatePhone(input.phone);
	if (phoneErr) {
		return Err({ kind: 'validation_failed', issues: [{ path: 'phone', message: phoneErr }] });
	}
	const normalizedPhone = normalizePhoneE164(input.phone)!;

	const conflict = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.phone, normalizedPhone), eq(users.status, 'active')))
		.limit(1);

	if (conflict[0] && conflict[0].id !== input.userId) {
		return Err({ kind: 'conflict', reason: 'That mobile number is already registered.' });
	}

	const otpId = newId<'OtpId'>();
	const rawCode = generateOtpCode();
	const codeHash = await hashOtpCode(rawCode);

	await db.insert(phoneOtps).values({
		id: otpId,
		userId: input.userId,
		phone: normalizedPhone,
		codeHash,
		purpose: input.purpose,
		expiresAt: new Date(now.getTime() + OTP_TTL_MS)
	});

	storeDevOtpCode(otpId, rawCode);

	return Ok({ otpId, expiresInSeconds: OTP_TTL_MS / 1000 });
}

export type VerifyOtpInput = {
	otpId: OtpId;
	code: string;
};

export type VerifyOtpResult = {
	userId: UserId;
	phoneVerified: true;
};

export async function verifyOtp(
	db: Database,
	input: VerifyOtpInput,
	now: Date,
	correlationId: string
): Promise<Result<VerifyOtpResult, UseCaseError>> {
	const code = input.code.trim();
	if (!/^\d{6}$/.test(code)) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'code', message: 'Enter the 6-digit code we sent you.' }]
		});
	}

	const rows = await db
		.select({
			id: phoneOtps.id,
			userId: phoneOtps.userId,
			phone: phoneOtps.phone,
			codeHash: phoneOtps.codeHash,
			attemptCount: phoneOtps.attemptCount,
			expiresAt: phoneOtps.expiresAt,
			consumedAt: phoneOtps.consumedAt
		})
		.from(phoneOtps)
		.where(eq(phoneOtps.id, input.otpId))
		.limit(1);

	const row = rows[0];
	if (!row || row.consumedAt || row.expiresAt <= now) {
		return Err({ kind: 'not_found', resource: 'otp' });
	}

	if (row.attemptCount >= OTP_MAX_ATTEMPTS) {
		return Err({
			kind: 'precondition_failed',
			reason: 'Too many incorrect attempts. Request a new code.'
		});
	}

	const valid = await verifyOtpCode(code, row.codeHash);
	if (!valid) {
		await db
			.update(phoneOtps)
			.set({ attemptCount: row.attemptCount + 1 })
			.where(eq(phoneOtps.id, input.otpId));
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'code', message: 'That code is incorrect. Try again.' }]
		});
	}

	const userId = row.userId as UserId;
	const phoneHash = hashPhone(row.phone);

	try {
		await db.transaction(async (tx) => {
			const consumed = await tx
				.update(phoneOtps)
				.set({ consumedAt: now })
				.where(and(eq(phoneOtps.id, input.otpId), isNull(phoneOtps.consumedAt)))
				.returning({ id: phoneOtps.id });

			if (consumed.length === 0) {
				throw new Error('otp_race');
			}

			await tx
				.update(users)
				.set({ phone: row.phone, phoneVerifiedAt: now, updatedAt: now })
				.where(eq(users.id, userId));

			await tx
				.insert(phoneRegistryHistory)
				.values({
					phoneHash,
					firstRegisteredAt: now,
					lastRegisteredAt: now
				})
				.onConflictDoUpdate({
					target: phoneRegistryHistory.phoneHash,
					set: { lastRegisteredAt: now }
				});

			const event: DomainEvent<'PhoneVerified', { userId: string; phoneHash: string }> = {
				eventId: newId(),
				eventName: 'PhoneVerified',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId,
				payload: { userId, phoneHash }
			};
			await publish(tx, event);
		});
	} catch {
		return Err({ kind: 'not_found', resource: 'otp' });
	}

	return Ok({ userId, phoneVerified: true });
}

export async function isPhoneVerified(db: Database, userId: UserId): Promise<boolean> {
	const rows = await db
		.select({ phoneVerifiedAt: users.phoneVerifiedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return rows[0]?.phoneVerifiedAt != null;
}
