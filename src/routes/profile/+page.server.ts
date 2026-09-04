import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import {
	changePassword,
	clearSessionCookie,
	getSelfAccountSummary,
	revokeSession
} from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export async function load({ locals }) {
	if (!locals.auth.userId || locals.auth.role === 'anonymous') {
		return { account: null };
	}

	const db = getDb();
	const account = await getSelfAccountSummary(db, locals.auth.userId);
	return { account };
}

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.auth.userId || !locals.auth.sessionId) {
			return fail(401, { message: 'Please sign in to continue.' });
		}

		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const currentPassword = String(data.get('currentPassword') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		if (newPassword !== confirmPassword) {
			return fail(422, { message: 'New passwords do not match.' });
		}

		const limited = await consumeRateLimit(
			db,
			bucketSpec('auth_login'),
			`account:${locals.auth.userId}`,
			now
		);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const result = await changePassword(
			db,
			{
				userId: locals.auth.userId,
				sessionId: locals.auth.sessionId,
				currentPassword,
				newPassword
			},
			now,
			locals.correlationId
		);

		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues });
			}
			return fail(403, { message: 'Current password is incorrect.' });
		}

		return { passwordChanged: true as const };
	},

	logout: async ({ locals, cookies }) => {
		const db = getDb();
		const now = new Date();
		if (locals.auth.sessionId) {
			await revokeSession(db, locals.auth.sessionId, now);
		}
		clearSessionCookie(cookies);
		redirect(303, '/');
	}
};
