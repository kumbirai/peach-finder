import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { getProfilePreviewForOwner } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

const QuerySchema = z.object({
	as: z.enum(['anonymous', 'seeker'])
});

export const GET: RequestHandler = async ({ url, locals }) => {
	const parsed = QuerySchema.safeParse({ as: url.searchParams.get('as') });
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
	const result = await getProfilePreviewForOwner(
		db,
		locals.auth.userId!,
		parsed.data.as,
		locals.auth.ipAddress
	);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success(result.value));
};
