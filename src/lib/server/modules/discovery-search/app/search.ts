import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { AuthContext } from '../../../shared/auth-context';
import { getConfig } from '../../platform-configuration';
import { dedupeIntents, parseQuery } from '../domain/parse-query';
import { suggestRelaxation, type RelaxationSuggestion } from '../domain/suggest-relaxation';
import type { StructuredQuery } from '../domain/structured-query';
import { resolveSearchCoords } from './resolve-search-coords';
import {
	toSearchCard,
	toSuggestions,
	type SearchCard,
	type SearchCardRow,
	type Suggestion
} from './serializers';

export type SearchInput = {
	q?: string;
	available?: boolean;
	verified?: boolean;
	minRating?: number;
	minReviews?: number;
	lang?: string[];
	tag?: string[];
	priceMin?: number;
	priceMax?: number;
	lat?: number;
	lng?: number;
	areaSlug?: string;
	near?: boolean;
	limit?: number;
	cursor?: string;
	lexicon: Array<{ term: string; entryType: string; mapsTo: unknown }>;
};

export type SearchResult = {
	cards: SearchCard[];
	nextCursor: string | null;
	appliedIntents: Array<{ key: string; label: string; source: string }>;
	proximityLabel: string | null;
	relaxation: RelaxationSuggestion | null;
};

function buildStructuredQuery(input: SearchInput): StructuredQuery {
	const sq = parseQuery(
		input.q ?? '',
		input.lexicon as never,
		{
			...(input.available !== undefined ? { availableNow: input.available } : {}),
			...(input.verified !== undefined ? { verified: input.verified } : {}),
			...(input.lang ? { languageCodes: input.lang } : {}),
			...(input.tag ? { serviceTagIds: input.tag } : {}),
			...(input.minRating !== undefined && Number.isFinite(input.minRating)
				? { minRating: input.minRating }
				: {}),
			...(input.minReviews !== undefined && Number.isFinite(input.minReviews)
				? { minReviews: input.minReviews }
				: {}),
			...(input.priceMin !== undefined ? { priceMin: input.priceMin } : {}),
			...(input.priceMax !== undefined ? { priceMax: input.priceMax } : {}),
			...(input.near || (input.lat && input.lng) || input.areaSlug ? { nearMe: true } : {})
		},
		{
			highlyRatedMinAverage: getConfig('provider-reviews.highly_rated_min_average'),
			highlyRatedMinReviews: getConfig('provider-reviews.highly_rated_min_reviews')
		}
	);
	sq.appliedIntents = dedupeIntents(sq.appliedIntents);
	return sq;
}

export async function runSearch(
	db: Database,
	input: SearchInput,
	viewer: AuthContext
): Promise<SearchResult> {
	const sq = buildStructuredQuery(input);
	const coords = await resolveSearchCoords(db, {
		...(input.lat != null ? { lat: input.lat } : {}),
		...(input.lng != null ? { lng: input.lng } : {}),
		...(input.areaSlug ? { areaSlug: input.areaSlug } : {})
	});
	const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
	const viewerId = viewer.userId;
	const langCodes = sq.languageCodes;
	const tagIds = sq.serviceTagIds;
	const lat = coords.lat;
	const lng = coords.lng;
	const skipLang = langCodes.length === 0;
	const skipTags = tagIds.length === 0;
	const langClause = skipLang
		? sql`true`
		: sql`p.language_codes && ARRAY[${sql.join(
				langCodes.map((code) => sql`${code}`),
				sql`, `
			)}]::text[]`;
	const tagClause = skipTags
		? sql`true`
		: sql`p.service_tag_ids @> ARRAY[${sql.join(
				tagIds.map((id) => sql`${id}::uuid`),
				sql`, `
			)}]::uuid[]`;

	const rows = await db.execute(sql`
		SELECT
			p.provider_profile_id,
			p.display_name,
			p.photo_primary_url,
			p.intro_extract,
			p.availability_state,
			p.availability_set_at,
			p.rating_average,
			p.rating_count,
			p.badge_identity_verified,
			p.badge_active_this_week,
			p.is_featured,
			p.price_min_cents,
			p.language_codes,
			a.name AS area_name,
			CASE WHEN ${lat}::double precision IS NULL THEN NULL ELSE
				6371 * acos(LEAST(1, GREATEST(-1,
					cos(radians(${lat}::double precision)) * cos(radians(a.centroid_lat)) *
					cos(radians(a.centroid_lng) - radians(${lng}::double precision)) +
					sin(radians(${lat}::double precision)) * sin(radians(a.centroid_lat))
				)))
			END AS distance_km,
			CASE
				WHEN ${sq.freeText} = '' THEN 0
				ELSE ts_rank(p.intro_tsvector, plainto_tsquery('english', ${sq.freeText}))
			END AS rel_rank
		FROM discovery_search.search_projection p
		JOIN platform_configuration.area a ON a.id = p.area_id
		WHERE
			(${sq.availableNow} = false OR p.availability_state = 'available')
			AND (${sq.verified} = false OR p.badge_identity_verified = true)
			AND (
				${sq.minRating}::double precision IS NULL
				OR (p.rating_average >= ${sq.minRating}::double precision AND p.rating_count >= ${sq.minRatingCount})
			)
			AND (${langClause})
			AND (${tagClause})
			AND (${sq.priceMax}::integer IS NULL OR p.price_min_cents <= ${sq.priceMax}::integer)
			AND (${sq.priceMin}::integer IS NULL OR p.price_max_cents >= ${sq.priceMin}::integer)
			AND (
				${sq.freeText} = ''
				OR p.intro_tsvector @@ plainto_tsquery('english', ${sq.freeText})
				OR p.search_text % ${sq.freeText}
			)
			AND (
				${viewerId}::uuid IS NULL
				OR NOT EXISTS (
					SELECT 1 FROM discovery_search.blocked_pair b
					WHERE b.blocker_id = p.owner_id AND b.blocked_id = ${viewerId}::uuid
				)
			)
		ORDER BY
			(p.availability_state = 'available') DESC,
			p.availability_set_at DESC NULLS LAST,
			p.is_featured DESC,
			rel_rank DESC,
			distance_km ASC NULLS LAST,
			p.badge_active_this_week DESC,
			p.last_activity_at DESC NULLS LAST,
			p.rating_average DESC NULLS LAST,
			p.rating_count DESC,
			p.provider_profile_id
		LIMIT ${limit + 1}
	`);

	const resultRows = (rows as unknown as Record<string, unknown>[]).map((row) => ({
		providerProfileId: String(row.provider_profile_id),
		displayName: String(row.display_name),
		photoPrimaryUrl: row.photo_primary_url ? String(row.photo_primary_url) : null,
		introExtract: String(row.intro_extract ?? ''),
		availabilityState: String(row.availability_state),
		availabilitySetAt: row.availability_set_at ? new Date(String(row.availability_set_at)) : null,
		ratingAverage: row.rating_average != null ? String(row.rating_average) : null,
		ratingCount: Number(row.rating_count ?? 0),
		badgeIdentityVerified: Boolean(row.badge_identity_verified),
		badgeActiveThisWeek: Boolean(row.badge_active_this_week),
		isFeatured: Boolean(row.is_featured),
		priceMinCents: row.price_min_cents != null ? Number(row.price_min_cents) : null,
		areaName: String(row.area_name),
		distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
		languageCodes: Array.isArray(row.language_codes)
			? (row.language_codes as string[]).map(String)
			: []
	})) satisfies SearchCardRow[];
	const hasMore = resultRows.length > limit;
	const page = hasMore ? resultRows.slice(0, limit) : resultRows;
	const cards = page.map((row) => toSearchCard(row, viewer));

	const proximityLabel =
		lat != null && lng != null ? (coords.areaName ? `Near ${coords.areaName}` : 'Near you') : null;

	const relaxation = cards.length === 0 ? suggestRelaxation(sq) : null;

	return {
		cards,
		nextCursor: null,
		appliedIntents: sq.appliedIntents,
		proximityLabel,
		relaxation
	};
}

export async function runSuggest(db: Database, prefix: string, limit = 8): Promise<Suggestion[]> {
	const q = prefix.trim().toLowerCase();
	if (!q) return [];

	const rows = await db.execute(sql`
		SELECT term, kind
		FROM discovery_search.suggest_term
		WHERE is_active = true
			AND (term ILIKE ${`${q}%`} OR term % ${q})
		ORDER BY (term ILIKE ${`${q}%`}) DESC,
			similarity(term, ${q}) DESC,
			term
		LIMIT ${limit}
	`);

	return toSuggestions(rows as unknown as Array<{ term: string; kind: string }>);
}
