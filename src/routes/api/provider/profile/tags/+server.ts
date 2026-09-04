import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { loadOwnerProfile, setServiceTags } from '$lib/server/modules/provider-profile';
import { zId } from '$lib/server/shared/zod';

export const _requiredRole: Role = 'provider';

const BodySchema = z.object({
	tagIds: z.array(zId<'ServiceTagId'>())
});

export const PUT: RequestHandler = async ({ request, locals }) => {
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
	const result = await setServiceTags(
		db,
		locals.auth.userId!,
		parsed.data.tagIds,
		crypto.randomUUID(),
		new Date()
	);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	return json(success(profile));
};
