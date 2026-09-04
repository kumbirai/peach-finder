import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { loadOwnerProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	if (!profile) {
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
	return json(success(profile));
};
