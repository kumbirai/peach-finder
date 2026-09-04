import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { completePasswordReset } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export function load({ url }) {
	const token = url.searchParams.get('token');
	return { token: token ?? '' };
}

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

export const actions: Actions = {
	default: async ({ request }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const token = String(data.get('token') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		if (newPassword !== confirmPassword) {
			return fail(422, {
				message: 'Passwords do not match.',
				token
			});
		}

		const limited =
			process.env.ALLOW_DEV_HELPERS === '1'
				? { ok: true as const, value: undefined }
				: await consumeRateLimit(db, bucketSpec('reset_complete'), `ip:${clientIp(request)}`, now);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.', token });
		}

		const result = await completePasswordReset(db, token, newPassword, now);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues, token });
			}
			return fail(404, { message: 'This reset link is invalid or has expired.', token });
		}

		redirect(303, '/sign-in?reset=1');
	}
};
