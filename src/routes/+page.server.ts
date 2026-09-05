import { redirect } from '@sveltejs/kit';
import { parseOptionalFiniteNumber } from '$lib/search-url';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { runSearch, parseQuery } from '$lib/server/modules/discovery-search';
import { DISCOVERY_CACHE_CONTROL } from '$lib/server/modules/discovery-search/discovery-cache';
import { getActiveLexiconForSearch, getConfig } from '$lib/server/modules/platform-configuration';

export const _requiredRole: Role = 'anonymous';

function readSearchParams(url: URL) {
	const q = url.searchParams.get('q') ?? '';
	const verified = url.searchParams.get('verified') === '1';
	const available = url.searchParams.get('available') === '1';
	const langs = url.searchParams.getAll('lang');
	const tags = url.searchParams.getAll('tag');
	const minRating = parseOptionalFiniteNumber(url.searchParams.get('minRating'));
	const priceMin = parseOptionalFiniteNumber(url.searchParams.get('priceMin'));
	const priceMax = parseOptionalFiniteNumber(url.searchParams.get('priceMax'));
	const near = url.searchParams.get('near') === '1';
	return { q, verified, available, langs, tags, minRating, priceMin, priceMax, near };
}

function hasStructuredFilters(params: ReturnType<typeof readSearchParams>): boolean {
	return (
		params.verified ||
		params.available ||
		params.langs.length > 0 ||
		params.tags.length > 0 ||
		params.minRating != null ||
		params.priceMin != null ||
		params.priceMax != null ||
		params.near
	);
}

function canonicalizeNaturalLanguageQuery(
	url: URL,
	lexicon: Array<{ term: string; entryType: string; mapsTo: unknown }>
): string | null {
	const { q } = readSearchParams(url);
	if (!q || hasStructuredFilters(readSearchParams(url))) return null;

	const sq = parseQuery(
		q,
		lexicon as never,
		{},
		{
			highlyRatedMinAverage: getConfig('provider-reviews.highly_rated_min_average'),
			highlyRatedMinReviews: getConfig('provider-reviews.highly_rated_min_reviews')
		}
	);
	if (!sq.appliedIntents.some((intent) => intent.source === 'query')) return null;

	const params = new URLSearchParams();
	if (sq.freeText) params.set('q', sq.freeText);
	if (sq.availableNow) params.set('available', '1');
	if (sq.verified) params.set('verified', '1');
	for (const lang of sq.languageCodes) params.append('lang', lang);
	for (const tag of sq.serviceTagIds) params.append('tag', tag);
	if (sq.minRating != null) params.set('minRating', String(sq.minRating));
	if (sq.nearMe) params.set('near', '1');
	return `/?${params.toString()}`;
}

export async function load({ url, locals, setHeaders }) {
	setHeaders({ 'cache-control': DISCOVERY_CACHE_CONTROL });
	const db = getDb();
	const lexicon = await getActiveLexiconForSearch(db);

	const canonical = canonicalizeNaturalLanguageQuery(url, lexicon);
	if (canonical) redirect(302, canonical);

	const { q, verified, available, langs, tags, minRating, priceMin, priceMax, near } =
		readSearchParams(url);

	const result = await runSearch(
		db,
		{
			q,
			verified,
			available,
			lang: langs,
			tag: tags,
			...(minRating != null ? { minRating } : {}),
			...(priceMin != null ? { priceMin } : {}),
			...(priceMax != null ? { priceMax } : {}),
			...(near ? { near: true } : {}),
			lexicon
		},
		locals.auth
	);

	return {
		cards: result.cards,
		appliedIntents: result.appliedIntents,
		q,
		verified,
		available,
		langs,
		tags,
		minRating,
		priceMin,
		priceMax,
		near
	};
}
