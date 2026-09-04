import type { Cookies } from '@sveltejs/kit';
import { SESSION_IDLE_MS } from '../domain/session-policy';

export const SESSION_COOKIE = 'pf_session';

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: SESSION_IDLE_MS / 1000
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
