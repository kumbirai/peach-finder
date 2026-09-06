import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getBillingHistoryForOwner } from '$lib/server/modules/listing-billing';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals, url }) => {
	const cursor = url.searchParams.get('cursor');
	const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
	const db = getDb();
	const result = await getBillingHistoryForOwner(db, locals.auth.userId!, {
		cursor,
		limit: Number.isFinite(limit) ? limit : 20
	});
	if (!result.ok) {
		const http = useCaseErrorToHttp(result.error);
		return json(http.body, { status: http.status });
	}
	return json(success(result.value.items, { nextCursor: result.value.nextCursor }));
};
