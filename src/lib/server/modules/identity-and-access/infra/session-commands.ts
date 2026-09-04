import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { newId, type SessionId, type UserId } from '../../../shared/ids';
import { sessions, users } from './schema';
import { SESSION_IDLE_MS } from '../domain/session-policy';
import { createHash, randomBytes } from 'node:crypto';

export const SEEKER_IDLE_MS = SESSION_IDLE_MS;

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): string {
	return randomBytes(32).toString('hex');
}

export async function createSession(
	db: Database,
	input: {
		userId: UserId;
		ipAddress: string;
		userAgent: string | null;
		now: Date;
	}
): Promise<{ token: string; sessionId: SessionId }> {
	const token = newSessionToken();
	const tokenHash = hashSessionToken(token);
	const sessionId = newId<'SessionId'>();
	await db.insert(sessions).values({
		id: sessionId,
		userId: input.userId,
		tokenHash,
		lastSeenAt: input.now,
		expiresAt: new Date(input.now.getTime() + SEEKER_IDLE_MS),
		ipAddress: input.ipAddress,
		userAgent: input.userAgent
	});
	return { token, sessionId };
}

export async function getUserCapabilities(
	db: Database,
	userId: UserId,
	ownsProviderProfile: boolean
): Promise<{
	userId: UserId;
	isSeeker: boolean;
	isProvider: boolean;
	isAdmin: boolean;
	emailVerified: boolean;
	phoneVerified: boolean;
}> {
	const rows = await db
		.select({
			isAdmin: users.isAdmin,
			emailVerifiedAt: users.emailVerifiedAt,
			phoneVerifiedAt: users.phoneVerifiedAt
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const row = rows[0];
	return {
		userId,
		isSeeker: true,
		isProvider: ownsProviderProfile,
		isAdmin: row?.isAdmin ?? false,
		emailVerified: row?.emailVerifiedAt != null,
		phoneVerified: row?.phoneVerifiedAt != null
	};
}

export async function revokeSession(
	db: Database | Transaction,
	sessionId: SessionId,
	now: Date
): Promise<void> {
	await db
		.update(sessions)
		.set({ revokedAt: now })
		.where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessionsForUser(
	db: Database | Transaction,
	userId: UserId,
	now: Date
): Promise<void> {
	await db
		.update(sessions)
		.set({ revokedAt: now })
		.where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function revokeOtherSessionsForUser(
	db: Database | Transaction,
	userId: UserId,
	keepSessionId: SessionId,
	now: Date
): Promise<number> {
	const updated = await db
		.update(sessions)
		.set({ revokedAt: now })
		.where(
			and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.revokedAt))
		)
		.returning({ id: sessions.id });
	return updated.length;
}

export async function stampReauth(
	db: Database | Transaction,
	sessionId: SessionId,
	now: Date
): Promise<void> {
	await db.update(sessions).set({ reauthAt: now }).where(eq(sessions.id, sessionId));
}

export async function getSessionReauthAt(db: Database, sessionId: SessionId): Promise<Date | null> {
	const rows = await db
		.select({ reauthAt: sessions.reauthAt })
		.from(sessions)
		.where(eq(sessions.id, sessionId))
		.limit(1);
	return rows[0]?.reauthAt ?? null;
}
