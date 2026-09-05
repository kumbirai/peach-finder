import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { asId } from '../../../shared/ids';
import {
	ADMIN_CHALLENGE_COOKIE,
	clearAdminLoginChallenge,
	issueAdminLoginChallenge,
	readAdminLoginChallenge
} from './admin-login-challenge';

function mockCookies(): Cookies & { jar: Map<string, string> } {
	const jar = new Map<string, string>();
	return {
		jar,
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => {
			jar.set(name, value);
		},
		delete: (name: string) => {
			jar.delete(name);
		},
		serialize: vi.fn()
	};
}

describe('admin-login-challenge', () => {
	const now = new Date('2026-09-06T10:00:00.000Z');
	const userId = asId<'UserId'>('01900000-0000-7000-8000-000000000097');

	it('round-trips a signed challenge cookie', () => {
		const cookies = mockCookies();
		issueAdminLoginChallenge(
			cookies,
			{ userId, email: 'admin@example.com', purpose: 'verify' },
			now,
			false
		);
		const challenge = readAdminLoginChallenge(cookies, now);
		expect(challenge).toMatchObject({
			userId,
			email: 'admin@example.com',
			purpose: 'verify'
		});
	});

	it('rejects tampered challenge signatures', () => {
		const cookies = mockCookies();
		issueAdminLoginChallenge(
			cookies,
			{ userId, email: 'admin@example.com', purpose: 'verify' },
			now,
			false
		);
		const token = cookies.jar.get(ADMIN_CHALLENGE_COOKIE)!;
		const [encoded] = token.split('.');
		cookies.jar.set(ADMIN_CHALLENGE_COOKIE, `${encoded}.tampered`);
		expect(readAdminLoginChallenge(cookies, now)).toBeNull();
	});

	it('expires challenges after the TTL', () => {
		const cookies = mockCookies();
		issueAdminLoginChallenge(
			cookies,
			{ userId, email: 'admin@example.com', purpose: 'verify' },
			now,
			false
		);
		const stillValid = new Date(now.getTime() + 9 * 60_000);
		expect(readAdminLoginChallenge(cookies, stillValid)).not.toBeNull();
		const expired = new Date(now.getTime() + 10 * 60_000 + 1);
		expect(readAdminLoginChallenge(cookies, expired)).toBeNull();
	});

	it('clears the challenge cookie', () => {
		const cookies = mockCookies();
		issueAdminLoginChallenge(
			cookies,
			{ userId, email: 'admin@example.com', purpose: 'verify' },
			now,
			false
		);
		clearAdminLoginChallenge(cookies);
		expect(cookies.jar.has(ADMIN_CHALLENGE_COOKIE)).toBe(false);
	});
});
