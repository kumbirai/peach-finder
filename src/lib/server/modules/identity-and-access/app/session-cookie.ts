import type { Cookies } from '@sveltejs/kit';
import { SESSION_IDLE_MS } from '../domain/session-policy';

export const SESSION_COOKIE = 'pf_session';

export type SessionCookieOptions = {
	/** Rely on DB idle expiry only — cookie survives until the browser closes. */
	dbIdleOnly?: boolean;
};

export function setSessionCookie(
	cookies: Cookies,
	token: string,
	secure: boolean,
	maxAgeMs: number = SESSION_IDLE_MS,
	options?: SessionCookieOptions
): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		...(options?.dbIdleOnly ? {} : { maxAge: maxAgeMs / 1000 })
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
