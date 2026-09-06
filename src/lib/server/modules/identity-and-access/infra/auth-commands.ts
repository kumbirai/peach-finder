import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publish } from '../../../shared/outbox';
import { newId, type SessionId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { emailVerificationTokens, oauthLinks, passwordResetTokens, users } from './schema';
import { hashPassword, verifyPassword } from './password-hash';
import { storeDevVerificationToken, storeDevPasswordResetToken } from './dev-verification';
import { validateDisplayName, validateEmail, validatePassword } from '../domain/password-policy';
import { PASSWORD_RESET_TTL_MS } from '../domain/session-policy';
import { writeAudit } from '../../../shared/audit';
import { recordTermsAcceptance } from './terms-acceptance';
import {
	revokeAllSessionsForUser,
	revokeOtherSessionsForUser,
	stampReauth
} from './session-commands';

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60_000;

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function newEmailVerificationToken(): string {
	return randomBytes(32).toString('hex');
}

export type RegisterSeekerInput = {
	email: string;
	password: string;
	displayName: string;
	acceptedTerms: boolean;
};

export type RegisterSeekerResult = {
	userId?: UserId;
	emailVerificationSent: boolean;
	verificationToken?: string;
	accountCreated: boolean;
};

export async function registerSeeker(
	db: Database,
	input: RegisterSeekerInput,
	now: Date,
	correlationId: string
): Promise<Result<RegisterSeekerResult, UseCaseError>> {
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
	if (issues.length) return Err({ kind: 'validation_failed', issues });

	const normalizedEmail = input.email.trim().toLowerCase();
	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	const passwordHash = await hashPassword(input.password);
	const rawToken = newEmailVerificationToken();
	const tokenHash = hashToken(rawToken);

	if (existing.length > 0) {
		// Anti-enumeration: uniform response shape; never issue a session for an existing account.
		return Ok({ emailVerificationSent: true, accountCreated: false });
	}

	const userId = newId<'UserId'>();

	await db.transaction(async (tx) => {
		await tx.insert(users).values({
			id: userId,
			email: normalizedEmail,
			passwordHash,
			displayName: input.displayName.trim(),
			status: 'active'
		});

		await tx.insert(emailVerificationTokens).values({
			id: newId(),
			userId,
			email: normalizedEmail,
			tokenHash,
			purpose: 'register',
			expiresAt: new Date(now.getTime() + EMAIL_VERIFY_TTL_MS)
		});

		await recordTermsAcceptance(tx, userId, now);

		const event: DomainEvent<'UserRegistered', { userId: string; registrationIntent: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'UserRegistered',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { userId, registrationIntent: 'seeker' }
		};
		await publish(tx, event);
	});

	storeDevVerificationToken(normalizedEmail, rawToken);

	return Ok({
		userId,
		emailVerificationSent: true,
		verificationToken: rawToken,
		accountCreated: true
	});
}

export type LoginPasswordInput = {
	email: string;
	password: string;
};

export type LoginPasswordResult = {
	userId: UserId;
	emailVerified: boolean;
};

export async function loginPassword(
	db: Database,
	input: LoginPasswordInput
): Promise<Result<LoginPasswordResult, UseCaseError>> {
	const normalizedEmail = input.email.trim().toLowerCase();
	const rows = await db
		.select({
			id: users.id,
			passwordHash: users.passwordHash,
			status: users.status,
			emailVerifiedAt: users.emailVerifiedAt
		})
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	const row = rows[0];
	if (!row?.passwordHash) {
		await verifyPassword(input.password, '$argon2id$v=19$m=19456,t=2,p=1$fake$fake');
		return Err({ kind: 'forbidden', reason: 'invalid email or password' });
	}

	if (row.status === 'suspended') {
		return Err({ kind: 'forbidden', reason: 'ACCOUNT_SUSPENDED' });
	}
	if (row.status !== 'active') {
		await verifyPassword(input.password, row.passwordHash);
		return Err({ kind: 'forbidden', reason: 'invalid email or password' });
	}

	const valid = await verifyPassword(input.password, row.passwordHash);
	if (!valid) {
		return Err({ kind: 'forbidden', reason: 'invalid email or password' });
	}

	return Ok({
		userId: asUserId(row.id),
		emailVerified: row.emailVerifiedAt !== null
	});
}

export async function verifyEmailToken(
	db: Database,
	rawToken: string,
	now: Date,
	correlationId: string
): Promise<Result<{ userId: UserId }, UseCaseError>> {
	const tokenHash = hashToken(rawToken);
	const rows = await db
		.select({
			id: emailVerificationTokens.id,
			userId: emailVerificationTokens.userId,
			expiresAt: emailVerificationTokens.expiresAt,
			consumedAt: emailVerificationTokens.consumedAt
		})
		.from(emailVerificationTokens)
		.where(eq(emailVerificationTokens.tokenHash, tokenHash))
		.limit(1);

	const row = rows[0];
	if (!row || row.consumedAt || row.expiresAt < now) {
		return Err({ kind: 'not_found', resource: 'email_verification_token' });
	}

	await db.transaction(async (tx) => {
		const updated = await tx
			.update(emailVerificationTokens)
			.set({ consumedAt: now })
			.where(
				and(eq(emailVerificationTokens.id, row.id), isNull(emailVerificationTokens.consumedAt))
			)
			.returning({ id: emailVerificationTokens.id });

		if (updated.length === 0) {
			throw new Error('token race');
		}

		await tx
			.update(users)
			.set({ emailVerifiedAt: now, updatedAt: now })
			.where(eq(users.id, row.userId));

		const event: DomainEvent<'EmailVerified', { userId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'EmailVerified',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { userId: row.userId }
		};
		await publish(tx, event);
	});

	return Ok({ userId: asUserId(row.userId) });
}

export async function isEmailVerified(db: Database, userId: UserId): Promise<boolean> {
	const rows = await db
		.select({ emailVerifiedAt: users.emailVerifiedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return rows[0]?.emailVerifiedAt != null;
}

export type OAuthProfile = {
	provider: 'google';
	subject: string;
	email: string;
	emailVerified: boolean;
	displayName: string;
};

export async function findOAuthLink(
	db: Database,
	provider: string,
	subject: string
): Promise<{ userId: UserId } | null> {
	const rows = await db
		.select({ userId: oauthLinks.userId })
		.from(oauthLinks)
		.where(and(eq(oauthLinks.provider, provider), eq(oauthLinks.providerSubject, subject)))
		.limit(1);
	return rows[0] ? { userId: asUserId(rows[0].userId) } : null;
}

export async function createOAuthUser(
	tx: Transaction,
	profile: OAuthProfile,
	now: Date,
	correlationId: string
): Promise<UserId> {
	const userId = newId<'UserId'>();
	await tx.insert(users).values({
		id: userId,
		email: profile.email.toLowerCase(),
		emailVerifiedAt: profile.emailVerified ? now : null,
		displayName: profile.displayName,
		status: 'active'
	});
	await tx.insert(oauthLinks).values({
		id: newId(),
		userId,
		provider: profile.provider,
		providerSubject: profile.subject,
		emailAtLink: profile.email.toLowerCase()
	});
	const event: DomainEvent<'UserRegistered', { userId: string; registrationIntent: string }> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'UserRegistered',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: { userId, registrationIntent: 'seeker' }
	};
	await publish(tx, event);
	return userId;
}

export async function linkOAuthToUser(
	tx: Transaction,
	userId: UserId,
	profile: OAuthProfile
): Promise<void> {
	await tx.insert(oauthLinks).values({
		id: newId(),
		userId,
		provider: profile.provider,
		providerSubject: profile.subject,
		emailAtLink: profile.email.toLowerCase()
	});
}

export function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

export type RequestPasswordResetResult = {
	requested: true;
	resetToken?: string;
};

export async function requestPasswordReset(
	db: Database,
	email: string,
	now: Date
): Promise<Result<RequestPasswordResetResult, UseCaseError>> {
	const emailErr = validateEmail(email);
	if (emailErr) {
		return Err({ kind: 'validation_failed', issues: [{ path: 'email', message: emailErr }] });
	}

	const normalizedEmail = email.trim().toLowerCase();
	const rows = await db
		.select({ id: users.id, status: users.status })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	const row = rows[0];
	if (row?.status === 'active') {
		const rawToken = newEmailVerificationToken();
		const tokenHash = hashToken(rawToken);
		await db.insert(passwordResetTokens).values({
			id: newId(),
			userId: row.id,
			tokenHash,
			expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS)
		});
		storeDevPasswordResetToken(normalizedEmail, rawToken);
		return Ok({
			requested: true,
			...(process.env.ALLOW_DEV_HELPERS === '1' ? { resetToken: rawToken } : {})
		});
	}

	return Ok({ requested: true });
}

export async function completePasswordReset(
	db: Database,
	rawToken: string,
	newPassword: string,
	now: Date
): Promise<Result<{ ok: true }, UseCaseError>> {
	const passwordErr = validatePassword(newPassword);
	if (passwordErr) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'newPassword', message: passwordErr }]
		});
	}

	const tokenHash = hashToken(rawToken);
	const rows = await db
		.select({
			id: passwordResetTokens.id,
			userId: passwordResetTokens.userId,
			expiresAt: passwordResetTokens.expiresAt,
			consumedAt: passwordResetTokens.consumedAt
		})
		.from(passwordResetTokens)
		.where(eq(passwordResetTokens.tokenHash, tokenHash))
		.limit(1);

	const row = rows[0];
	if (!row || row.consumedAt || row.expiresAt < now) {
		return Err({ kind: 'not_found', resource: 'password_reset_token' });
	}

	const passwordHash = await hashPassword(newPassword);
	const userId = asUserId(row.userId);
	let tokenLostRace = false;

	await db.transaction(async (tx) => {
		const updated = await tx
			.update(passwordResetTokens)
			.set({ consumedAt: now })
			.where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.consumedAt)))
			.returning({ id: passwordResetTokens.id });

		if (updated.length === 0) {
			tokenLostRace = true;
			return;
		}

		await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId));

		await revokeAllSessionsForUser(tx, userId, now);
	});

	if (tokenLostRace) {
		return Err({ kind: 'not_found', resource: 'password_reset_token' });
	}

	return Ok({ ok: true });
}

export async function reauthWithPassword(
	db: Database,
	input: { userId: UserId; sessionId: SessionId; password: string },
	now: Date
): Promise<Result<{ reauthedUntil: string }, UseCaseError>> {
	const rows = await db
		.select({ passwordHash: users.passwordHash, status: users.status })
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);

	const row = rows[0];
	if (!row?.passwordHash || row.status !== 'active') {
		return Err({ kind: 'forbidden', reason: 'invalid password' });
	}

	const valid = await verifyPassword(input.password, row.passwordHash);
	if (!valid) {
		return Err({ kind: 'forbidden', reason: 'invalid password' });
	}

	await stampReauth(db, input.sessionId, now);
	return Ok({ reauthedUntil: new Date(now.getTime() + 15 * 60_000).toISOString() });
}

export async function changePassword(
	db: Database,
	input: {
		userId: UserId;
		sessionId: SessionId;
		currentPassword: string;
		newPassword: string;
	},
	now: Date,
	correlationId: string
): Promise<Result<{ ok: true }, UseCaseError>> {
	const passwordErr = validatePassword(input.newPassword);
	if (passwordErr) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'newPassword', message: passwordErr }]
		});
	}

	const rows = await db
		.select({ passwordHash: users.passwordHash, status: users.status })
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);

	const row = rows[0];
	if (!row?.passwordHash || row.status !== 'active') {
		return Err({ kind: 'forbidden', reason: 'invalid password' });
	}

	const valid = await verifyPassword(input.currentPassword, row.passwordHash);
	if (!valid) {
		return Err({ kind: 'forbidden', reason: 'invalid password' });
	}

	const passwordHash = await hashPassword(input.newPassword);

	await db.transaction(async (tx) => {
		await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, input.userId));

		const revokedCount = await revokeOtherSessionsForUser(tx, input.userId, input.sessionId, now);
		await stampReauth(tx, input.sessionId, now);

		if (revokedCount > 0) {
			await writeAudit(tx, {
				actorId: input.userId,
				actorRole: 'seeker',
				action: 'session.revoke_others',
				targetType: 'user',
				targetId: input.userId,
				reason: 'password_change',
				metadata: { revokedCount },
				correlationId
			});
		}
	});

	return Ok({ ok: true });
}

function asUserId(id: string): UserId {
	return id as UserId;
}
