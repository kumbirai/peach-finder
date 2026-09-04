import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { reauthWithPassword } from '$lib/server/modules/identity-and-access';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'seeker';

const BodySchema = z.object({ password: z.string().min(1) });

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth.userId || !locals.auth.sessionId) {
		return json(
			{
				error: {
					code: 'UNAUTHENTICATED',
					message: 'Please sign in to continue.',
					fields: null
				}
			},
			{ status: 401 }
		);
	}

	const body = BodySchema.safeParse(await request.json());
	if (!body.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'password', message: 'Password is required.' }]
				}
			},
			{ status: 422 }
		);
	}

	const db = getDb();
	const now = new Date();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('auth_login'),
		`account:${locals.auth.userId}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const result = await reauthWithPassword(
		db,
		{
			userId: locals.auth.userId,
			sessionId: locals.auth.sessionId,
			password: body.data.password
		},
		now
	);

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
