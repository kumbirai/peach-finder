import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getBillingPriceForOwner } from '$lib/server/modules/listing-billing';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const result = await getBillingPriceForOwner(db, locals.auth.userId!);
	if (!result.ok) {
		const http = useCaseErrorToHttp(result.error);
		return json(http.body, { status: http.status });
	}
	return json(success(result.value));
};
