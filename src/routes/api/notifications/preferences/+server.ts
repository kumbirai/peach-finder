import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	getNotificationPreferences,
	updateNotificationPreferences
} from '$lib/server/modules/user-notifications';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'seeker';

const BodySchema = z.object({
	updates: z
		.array(
			z.object({
				category: z.string().min(1),
				channel: z.string().min(1),
				enabled: z.boolean()
			})
		)
		.min(1)
});

export const GET: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const preferences = await getNotificationPreferences(db, locals.auth.userId!);
	return json(success(preferences));
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	const parsed = BodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const db = getDb();
	const result = await updateNotificationPreferences(db, locals.auth.userId!, parsed.data.updates);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success(result.value));
};
