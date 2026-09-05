import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId } from '$lib/server/shared/ids';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { reorderProfilePhotos, loadOwnerProfile } from '$lib/server/modules/provider-profile';

const bodySchema = z.object({
	order: z.array(z.string().uuid()).min(1)
});

export const _requiredRole: Role = 'provider';

export const PUT: RequestHandler = async ({ request, locals }) => {
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'order', message: 'Photo order is required.' }]
				}
			},
			{ status: 422 }
		);
	}

	const order = parsed.data.order.map((id) => asId<'PhotoId'>(id));
	const db = getDb();
	const result = await reorderProfilePhotos(
		db,
		locals.auth.userId!,
		order,
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
