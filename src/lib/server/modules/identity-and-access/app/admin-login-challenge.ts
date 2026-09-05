import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { UserId } from '../../../shared/ids';

export const ADMIN_CHALLENGE_COOKIE = 'pf_admin_challenge';
const CHALLENGE_TTL_MS = 10 * 60_000;

export type AdminLoginChallenge = {
	userId: UserId;
	email: string;
	purpose: 'enroll' | 'verify';
	pendingSecretBase64?: string;
	backupCodes?: string[];
	expiresAt: number;
};

function challengeKey(): Buffer {
	const raw = process.env.TOTP_ENCRYPTION_KEY;
	const material = raw
		? Buffer.from(raw, 'base64')
		: Buffer.from('dev-totp-key-32bytes-not-prod!!', 'utf8');
	if (process.env.NODE_ENV === 'production' && !raw) {
		throw new Error('TOTP_ENCRYPTION_KEY must be set in production');
	}
	return createHash('sha256').update(material).digest();
}

function sign(payload: string): string {
	return createHmac('sha256', challengeKey()).update(payload).digest('base64url');
}

export function issueAdminLoginChallenge(
	cookies: Cookies,
	challenge: Omit<AdminLoginChallenge, 'expiresAt'>,
	now: Date,
	secure: boolean
): void {
	const payload: AdminLoginChallenge = {
		...challenge,
		expiresAt: now.getTime() + CHALLENGE_TTL_MS
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const token = `${encoded}.${sign(encoded)}`;
	cookies.set(ADMIN_CHALLENGE_COOKIE, token, {
		path: '/admin',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: CHALLENGE_TTL_MS / 1000
	});
}

export function readAdminLoginChallenge(cookies: Cookies, now: Date): AdminLoginChallenge | null {
	const token = cookies.get(ADMIN_CHALLENGE_COOKIE);
	if (!token) return null;
	const [encoded, signature] = token.split('.');
	const expected = sign(encoded);
	if (!encoded || !signature || !hashMatches(expected, signature)) return null;
	try {
		const parsed = JSON.parse(
			Buffer.from(encoded, 'base64url').toString('utf8')
		) as AdminLoginChallenge;
		if (parsed.expiresAt < now.getTime()) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function clearAdminLoginChallenge(cookies: Cookies): void {
	cookies.delete(ADMIN_CHALLENGE_COOKIE, { path: '/admin' });
}

export async function verifyBackupCode(
	code: string,
	hashes: string[],
	verifyHash: (plain: string, hash: string) => Promise<boolean>
): Promise<{ index: number } | null> {
	const normalized = code.trim().toLowerCase();
	for (let i = 0; i < hashes.length; i++) {
		const hash = hashes[i];
		if (!hash || hash === 'used') continue;
		if (await verifyHash(normalized, hash)) return { index: i };
	}
	return null;
}

export function hashMatches(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}
