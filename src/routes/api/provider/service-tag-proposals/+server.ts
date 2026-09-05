import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { proposeServiceTag } from '$lib/server/modules/provider-profile';

const bodySchema = z.object({
	name: z.string().trim().min(1).max(60)
});

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'name', message: 'Enter a tag name up to 60 characters.' }]
				}
			},
			{ status: 422 }
		);
	}

	const result = await proposeServiceTag(getDb(), locals.auth.userId!, parsed.data.name);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success(result.value), { status: 201 });
};
