import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { ADMIN_SESSION_IDLE_MS } from '../domain/session-policy';
import { SESSION_COOKIE, setSessionCookie } from './session-cookie';

function mockCookies(): Cookies {
	return {
		get: vi.fn(),
		set: vi.fn(),
		delete: vi.fn(),
		serialize: vi.fn()
	};
}

describe('session-cookie', () => {
	it('sets maxAge for standard sliding-window browser expiry', () => {
		const cookies = mockCookies();
		setSessionCookie(cookies, 'token', false, ADMIN_SESSION_IDLE_MS);
		expect(cookies.set).toHaveBeenCalledWith(SESSION_COOKIE, 'token', {
			path: '/',
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
			maxAge: ADMIN_SESSION_IDLE_MS / 1000
		});
	});

	it('omits maxAge when admin idle is enforced only in the database', () => {
		const cookies = mockCookies();
		setSessionCookie(cookies, 'token', true, ADMIN_SESSION_IDLE_MS, { dbIdleOnly: true });
		expect(cookies.set).toHaveBeenCalledWith(SESSION_COOKIE, 'token', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax'
		});
	});
});
