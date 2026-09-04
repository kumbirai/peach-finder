import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { newId, type SessionId, type UserId } from '../../../shared/ids';
import { sessions, users } from './schema';
import { createHash, randomBytes } from 'node:crypto';

export const SEEKER_IDLE_MS = 90 * 24 * 60 * 60_000;

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
