import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { getDashboardForOwner, parseDashboardRange } from '$lib/server/modules/provider-analytics';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals, url }) => {
	const db = getDb();
	const rangeDays = parseDashboardRange(url.searchParams.get('range'));
	const dashboard = await getDashboardForOwner(db, locals.auth.userId!, rangeDays);
	if (!dashboard) {
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

	return json(success(dashboard));
};
