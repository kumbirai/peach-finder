import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { verifyEmailToken } from '$lib/server/modules/identity-and-access';
import { releaseHeldMessagesForUser } from '$lib/server/modules/direct-messaging';

export const _requiredRole: Role = 'anonymous';

export function load({ url }) {
	return {
		token: url.searchParams.get('token'),
		returnTo: url.searchParams.get('returnTo') ?? '/messages'
	};
}

export const actions: Actions = {
	default: async ({ request }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const token = String(data.get('token') ?? '');

		const limited = await consumeRateLimit(
			db,
			bucketSpec('verify_email'),
			`ip:${request.headers.get('cf-connecting-ip') ?? '127.0.0.1'}`,
			now
		);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts.' });
		}

		const result = await verifyEmailToken(db, token, now, crypto.randomUUID());
		if (!result.ok) {
			return fail(404, { message: 'This verification link is invalid or expired.' });
		}

		await releaseHeldMessagesForUser(db, result.value.userId, now, crypto.randomUUID());

		const returnTo = String(data.get('returnTo') ?? '/messages');
		redirect(303, returnTo);
	}
};
