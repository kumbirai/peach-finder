import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { getOwnedProfileDashboard } from '$lib/server/modules/provider-profile';
import { getOwnVerificationStatus } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const db = getDb();
	const dashboard = await getOwnedProfileDashboard(db, locals.auth.userId);
	if (!dashboard) {
		return json(
			{
				error: {
					code: 'NOT_FOUND',
					message: 'We could not find your provider profile.',
					fields: null
				}
			},
			{ status: 404 }
		);
	}

	const status = await getOwnVerificationStatus(db, dashboard.profileId);
	return json(success(status));
};
