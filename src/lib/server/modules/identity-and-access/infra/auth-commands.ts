import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publish } from '../../../shared/outbox';
import { newId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { emailVerificationTokens, oauthLinks, users } from './schema';
import { hashPassword, verifyPassword } from './password-hash';
import { storeDevVerificationToken } from './dev-verification';
import { validateDisplayName, validateEmail, validatePassword } from '../domain/password-policy';

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

function asUserId(id: string): UserId {
	return id as UserId;
}
