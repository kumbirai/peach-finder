import { fail, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { requestPasswordReset } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export const actions: Actions = {
	default: async ({ request }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const email = String(data.get('email') ?? '');

		const limited =
			process.env.ALLOW_DEV_HELPERS === '1'
				? { ok: true as const, value: undefined }
				: await consumeRateLimit(
						db,
						bucketSpec('password_reset_request'),
						`email:${email.trim().toLowerCase()}`,
						now
					);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const result = await requestPasswordReset(db, email, now);
		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues });
			}
			return fail(400, { message: 'Could not process request.' });
		}

		return { requested: true as const };
	}
};
