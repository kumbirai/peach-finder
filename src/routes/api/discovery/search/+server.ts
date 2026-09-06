import { json, type RequestHandler } from '@sveltejs/kit';
import { parseOptionalCoord, parseOptionalFiniteNumber } from '$lib/search-url';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { runSearch } from '$lib/server/modules/discovery-search';
import { DISCOVERY_CACHE_CONTROL } from '$lib/server/modules/discovery-search/discovery-cache';
import { getActiveLexiconForSearch } from '$lib/server/modules/platform-configuration';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
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

	const lexicon = await getActiveLexiconForSearch(db);
	const minRating = parseOptionalFiniteNumber(url.searchParams.get('minRating'));
	const minReviews = parseOptionalFiniteNumber(url.searchParams.get('minReviews'));
	const lat = parseOptionalCoord(url.searchParams.get('lat'));
	const lng = parseOptionalCoord(url.searchParams.get('lng'));

	const result = await runSearch(
		db,
		{
			...(url.searchParams.get('q') ? { q: url.searchParams.get('q')! } : {}),
			verified: url.searchParams.get('verified') === '1',
			available: url.searchParams.get('available') === '1',
			...(minRating != null ? { minRating } : {}),
			...(minReviews != null ? { minReviews } : {}),
			lang: url.searchParams.getAll('lang'),
			tag: url.searchParams.getAll('tag'),
			...(url.searchParams.get('priceMin')
				? { priceMin: Number(url.searchParams.get('priceMin')) }
				: {}),
			...(url.searchParams.get('priceMax')
				? { priceMax: Number(url.searchParams.get('priceMax')) }
				: {}),
			...(lat != null ? { lat } : {}),
			...(lng != null ? { lng } : {}),
			...(url.searchParams.get('area') ? { areaSlug: url.searchParams.get('area')! } : {}),
			...(url.searchParams.get('near') === '1' ? { near: true } : {}),
			...(url.searchParams.get('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
			...(url.searchParams.get('cursor') ? { cursor: url.searchParams.get('cursor')! } : {}),
			lexicon
		},
		locals.auth
	);

	return json(
		success(result.cards, {
			nextCursor: result.nextCursor,
			appliedIntents: JSON.stringify(result.appliedIntents),
			...(result.relaxation ? { relaxation: JSON.stringify(result.relaxation) } : {})
		}),
		{ headers: { 'cache-control': DISCOVERY_CACHE_CONTROL } }
	);
};
