import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId } from '$lib/server/shared/ids';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { attachProfilePhoto, loadOwnerProfile } from '$lib/server/modules/provider-profile';

const bodySchema = z.object({
	photoId: z.string().uuid()
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
					fields: [{ path: 'photoId', message: 'A valid photo id is required.' }]
				}
			},
			{ status: 422 }
		);
	}

	const photoId = asId<'PhotoId'>(parsed.data.photoId);
	const db = getDb();
	const result = await attachProfilePhoto(
		db,
		locals.auth.userId!,
		photoId,
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
