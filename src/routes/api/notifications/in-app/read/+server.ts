import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { markInAppNotificationsRead } from '$lib/server/modules/user-notifications';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'seeker';

const BodySchema = z.object({
	ids: z.array(z.string().uuid()).min(1)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = BodySchema.safeParse(await request.json());
	if (!body.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Invalid request.',
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
	await markInAppNotificationsRead(db, locals.auth.userId!, body.data.ids, new Date());
	return json(success({ read: body.data.ids.length }));
};
