import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import {
	listPublicReviewsForProvider,
	parseProviderProfileId
} from '$lib/server/modules/provider-reviews';
import { getPublicProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ params, url, locals, getClientAddress }) => {
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

	const parsed = parseProviderProfileId(params.providerProfileId!);
	if (!parsed.ok) {
		const mapped = useCaseErrorToHttp(parsed.error);
		return json(mapped.body, { status: mapped.status });
	}

	const profile = await getPublicProfile(db, parsed.value, locals.auth);
	if (!profile.ok) {
		const mapped = useCaseErrorToHttp(profile.error);
		return json(mapped.body, { status: mapped.status });
	}

	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Number(limitParam) : undefined;
	const cursor = url.searchParams.get('cursor') ?? undefined;

	const result = await listPublicReviewsForProvider(db, parsed.value, {
		...(limit != null && !Number.isNaN(limit) ? { limit } : {}),
		...(cursor ? { cursor } : {})
	});

	return json(success(result.reviews, { nextCursor: result.nextCursor }));
};
