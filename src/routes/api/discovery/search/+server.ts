import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { runSearch } from '$lib/server/modules/discovery-search';
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

	const result = await runSearch(
		db,
		{
			...(url.searchParams.get('q') ? { q: url.searchParams.get('q')! } : {}),
			verified: url.searchParams.get('verified') === '1',
			available: url.searchParams.get('available') === '1',
			...(url.searchParams.get('minRating')
				? { minRating: Number(url.searchParams.get('minRating')) }
				: {}),
			lang: url.searchParams.getAll('lang'),
			tag: url.searchParams.getAll('tag'),
			...(url.searchParams.get('priceMin')
				? { priceMin: Number(url.searchParams.get('priceMin')) }
				: {}),
			...(url.searchParams.get('priceMax')
				? { priceMax: Number(url.searchParams.get('priceMax')) }
				: {}),
			...(url.searchParams.get('lat') ? { lat: Number(url.searchParams.get('lat')) } : {}),
			...(url.searchParams.get('lng') ? { lng: Number(url.searchParams.get('lng')) } : {}),
			...(url.searchParams.get('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
			...(url.searchParams.get('cursor') ? { cursor: url.searchParams.get('cursor')! } : {}),
			lexicon
		},
		locals.auth
	);

	return json(
		success(result.cards, {
			nextCursor: result.nextCursor,
			appliedIntents: JSON.stringify(result.appliedIntents)
		})
	);
};
