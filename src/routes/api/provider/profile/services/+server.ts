import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { addService, loadOwnerProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

const BodySchema = z.object({
	name: z.string().min(1).max(120),
	description: z.string().max(1000).optional(),
	durationMinutes: z.number().int().min(1).max(600),
	priceCents: z.number().int().min(0)
});

export const POST: RequestHandler = async ({ request, locals }) => {
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
	const result = await addService(
		db,
		locals.auth.userId!,
		{
			name: parsed.data.name,
			durationMinutes: parsed.data.durationMinutes,
			priceCents: parsed.data.priceCents,
			...(parsed.data.description !== undefined ? { description: parsed.data.description } : {})
		},
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
