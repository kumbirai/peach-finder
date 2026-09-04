import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import { emailVerificationTokens, users } from './schema';
import { hashToken } from './auth-commands';

export async function getLatestVerificationTokenForEmail(
	db: Database,
	email: string
): Promise<string | null> {
	const rows = await db
		.select({ tokenHash: emailVerificationTokens.tokenHash })
		.from(emailVerificationTokens)
		.where(eq(emailVerificationTokens.email, email.trim().toLowerCase()))
		.orderBy(desc(emailVerificationTokens.createdAt))
		.limit(1);

	// Dev/E2E only: tokens are not reversible from hash — callers must use registerSeeker return value
	void rows;
	void hashToken;
	return null;
}

export async function getVerificationTokenHashForUser(
	db: Database,
	userId: string
): Promise<{ tokenHash: string } | null> {
	const rows = await db
		.select({ tokenHash: emailVerificationTokens.tokenHash })
		.from(emailVerificationTokens)
		.where(eq(emailVerificationTokens.userId, userId))
		.orderBy(desc(emailVerificationTokens.createdAt))
		.limit(1);
	return rows[0] ?? null;
}

/** Dev/E2E helper — stores raw token alongside hash is not in schema; use in-memory dev store instead */
const devTokenStore = new Map<string, string>();

export function storeDevVerificationToken(email: string, rawToken: string): void {
	if (process.env.ALLOW_DEV_HELPERS === '1') {
		devTokenStore.set(email.trim().toLowerCase(), rawToken);
	}
}

export function getDevVerificationToken(email: string): string | null {
	if (process.env.ALLOW_DEV_HELPERS !== '1') return null;
	return devTokenStore.get(email.trim().toLowerCase()) ?? null;
}

export function getDevPasswordResetToken(email: string): string | null {
	if (process.env.ALLOW_DEV_HELPERS !== '1') return null;
	return devResetTokenStore.get(email.trim().toLowerCase()) ?? null;
}

export function storeDevPasswordResetToken(email: string, rawToken: string): void {
	if (process.env.ALLOW_DEV_HELPERS === '1') {
		devResetTokenStore.set(email.trim().toLowerCase(), rawToken);
	}
}

const devOtpStore = new Map<string, string>();

export function storeDevOtpCode(otpId: string, rawCode: string): void {
	if (process.env.ALLOW_DEV_HELPERS === '1') {
		devOtpStore.set(otpId, rawCode);
	}
}

export function getDevOtpCode(otpId: string): string | null {
	if (process.env.ALLOW_DEV_HELPERS !== '1') return null;
	return devOtpStore.get(otpId) ?? null;
}

const devResetTokenStore = new Map<string, string>();

export async function findUserIdByEmail(db: Database, email: string): Promise<UserId | null> {
	const rows = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email.trim().toLowerCase()))
		.limit(1);
	const row = rows[0];
	return row ? asId<'UserId'>(row.id) : null;
}
