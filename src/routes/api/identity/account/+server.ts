import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { clearSessionCookie, deleteAccount } from '$lib/server/modules/identity-and-access';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'seeker';

const BodySchema = z.object({
	password: z.string().min(1),
	confirm: z.literal(true)
});

export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
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
					fields: body.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const db = getDb();
	const now = new Date();

	const result = await deleteAccount(
		db,
		{
			userId: locals.auth.userId,
			sessionId: locals.auth.sessionId,
			password: body.data.password,
			confirm: true
		},
		now,
		locals.correlationId
	);

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	clearSessionCookie(cookies);
	return json(success(result.value));
};
