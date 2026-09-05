import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { getSafetyInfo } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ getClientAddress }) => {
	const db = getDb();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('search_query'),
		`ip:${getClientAddress()}`,
		new Date()
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(getSafetyInfo()));
};
