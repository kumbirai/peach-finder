import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { loadOwnerProfile, unpublishProfileForOwnerDb } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const now = new Date();
	const profileId = await unpublishProfileForOwnerDb(
		db,
		locals.auth.userId!,
		'owner',
		crypto.randomUUID(),
		now
	);
	if (!profileId) {
		return json(
			{
				error: {
					code: 'NOT_FOUND',
					message: 'We could not find that.',
					fields: null
				}
			},
			{ status: 404 }
		);
	}

	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	return json(success(profile));
};
