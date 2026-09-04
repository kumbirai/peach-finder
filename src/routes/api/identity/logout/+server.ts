import { redirect, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { clearSessionCookie, revokeSession } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'seeker';

export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	const db = getDb();
	const now = new Date();

	if (locals.auth.sessionId) {
		await revokeSession(db, locals.auth.sessionId, now);
	}
	clearSessionCookie(cookies);

	const returnTo = url.searchParams.get('returnTo');
	if (returnTo && returnTo.startsWith('/')) {
		redirect(303, returnTo);
	}
	redirect(303, '/');
};
