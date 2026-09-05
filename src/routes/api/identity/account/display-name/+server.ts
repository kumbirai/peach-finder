import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { applyIdentityAttributesChangedSync } from '$lib/server/shared/identity-change-sync';
import { updateDisplayName } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'seeker';

const BodySchema = z.object({
	displayName: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth.userId) {
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

	const parsed = BodySchema.safeParse(await request.json());
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
	const now = new Date();
	const result = await updateDisplayName(
		db,
		locals.auth.userId,
		parsed.data.displayName,
		locals.correlationId,
		now
	);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	if (result.value.identityEvent) {
		await applyIdentityAttributesChangedSync(db, result.value.identityEvent, now);
	}

	return json(success({ displayName: result.value.displayName }));
};
