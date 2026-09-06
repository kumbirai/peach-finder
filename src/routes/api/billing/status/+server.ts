import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getBillingStatusForOwner } from '$lib/server/modules/listing-billing';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const status = await getBillingStatusForOwner(db, locals.auth.userId!);
	if (!status) {
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

	return json(success(status));
};
