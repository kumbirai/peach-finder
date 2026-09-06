import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { METRIC_DEFINITIONS, type DashboardRangeDays } from '../domain/metric-definitions';
import { highlightOwnServiceTags } from '../domain/demand-signal';
import {
	buildComparison,
	buildTrendPoints,
	formatCount,
	type DashboardMetricView,
	type MostSearchedServiceView,
	type ProviderDashboardView
} from './serializers';

type DailyRow = {
	day: string;
	profile_views: number;
	search_appearances: number;
	contact_requests: number;
};

type CachedMetricRaw = {
	currentCount: number;
	priorCount: number;
	trend: Array<{ day: string; count: number }>;
};

type CachedPayloadRaw = {
	rangeDays: DashboardRangeDays;
	profileViews: CachedMetricRaw;
	searchAppearances: CachedMetricRaw;
	contactRequests: CachedMetricRaw;
	mostSearchedServices: MostSearchedServiceView[];
};

const CACHE_TTL_MS = 5 * 60_000;

function startOfUtcDay(instant: Date): Date {
	return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

function addUtcDays(instant: Date, days: number): Date {
	const next = new Date(instant);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function dayKeysBetween(start: Date, end: Date): string[] {
	const keys: string[] = [];
	for (let cursor = start; cursor < end; cursor = addUtcDays(cursor, 1)) {
		keys.push(cursor.toISOString().slice(0, 10));
	}
	return keys;
}

async function queryDailyRollups(
	db: Database,
	providerProfileId: ProviderProfileId,
	rangeStart: Date,
	rangeEnd: Date
): Promise<DailyRow[]> {
	const result = await db.execute(sql`
		SELECT
			to_char(date_trunc('day', hour_bucket AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
			COALESCE(SUM(profile_views), 0)::int AS profile_views,
			COALESCE(SUM(search_appearances), 0)::int AS search_appearances,
			COALESCE(SUM(contact_requests), 0)::int AS contact_requests
		FROM provider_analytics.hourly_rollup
		WHERE provider_profile_id = ${providerProfileId}::uuid
		  AND hour_bucket >= ${rangeStart.toISOString()}::timestamptz
		  AND hour_bucket < ${rangeEnd.toISOString()}::timestamptz
		GROUP BY 1
		ORDER BY 1
	`);
	return (result as unknown as { rows?: DailyRow[] }).rows ?? (result as unknown as DailyRow[]);
}

function sumMetric(rows: DailyRow[], key: keyof Omit<DailyRow, 'day'>): number {
	return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function buildMetricRaw(
	rows: DailyRow[],
	metric: keyof Omit<DailyRow, 'day'>,
	rangeStart: Date,
	rangeEnd: Date,
	priorRows: DailyRow[]
): CachedMetricRaw {
	const currentCount = sumMetric(rows, metric);
	const priorCount = sumMetric(priorRows, metric);
	const byDay = new Map(rows.map((row) => [row.day, Number(row[metric] ?? 0)]));
	const trend = dayKeysBetween(rangeStart, rangeEnd).map((day) => ({
		day,
		count: byDay.get(day) ?? 0
	}));
	return { currentCount, priorCount, trend };
}

function serializeMetricRaw(raw: CachedMetricRaw): DashboardMetricView {
	return {
		currentTotal: formatCount(raw.currentCount),
		trend: buildTrendPoints(raw.trend),
		priorPeriodComparison: buildComparison(raw.currentCount, raw.priorCount)
	};
}

function reapplyDemandTagOwnership(
	services: MostSearchedServiceView[],
	providerTagIds: ReadonlySet<string>
): MostSearchedServiceView[] {
	return highlightOwnServiceTags(
		services.map((row) => ({
			tagId: row.tagId,
			tag: row.tag,
			demandRank: row.demandRank
		})),
		providerTagIds
	);
}

function serializeCachedPayload(
	raw: CachedPayloadRaw,
	providerTagIds: ReadonlySet<string>
): Omit<ProviderDashboardView, 'definitions'> {
	return {
		rangeDays: raw.rangeDays,
		profileViews: serializeMetricRaw(raw.profileViews),
		searchAppearances: serializeMetricRaw(raw.searchAppearances),
		contactRequests: serializeMetricRaw(raw.contactRequests),
		mostSearchedServices: reapplyDemandTagOwnership(raw.mostSearchedServices, providerTagIds)
	};
}

function isCachedPayloadRaw(payload: unknown): payload is CachedPayloadRaw {
	if (!payload || typeof payload !== 'object') return false;
	const candidate = payload as CachedPayloadRaw;
	return (
		typeof candidate.profileViews?.currentCount === 'number' &&
		Array.isArray(candidate.profileViews?.trend)
	);
}

async function readCache(
	db: Database,
	providerProfileId: ProviderProfileId,
	rangeDays: DashboardRangeDays,
	now: Date
): Promise<CachedPayloadRaw | null> {
	const result = await db.execute(sql`
		SELECT computed_at, payload
		FROM provider_analytics.dashboard_metric_cache
		WHERE provider_profile_id = ${providerProfileId}::uuid
		  AND range_days = ${rangeDays}
		LIMIT 1
	`);
	const row = ((result as unknown as { rows?: Array<{ computed_at: Date; payload: unknown }> })
		.rows ?? result)[0] as { computed_at: Date; payload: unknown } | undefined;
	if (!row) return null;
	if (now.getTime() - new Date(row.computed_at).getTime() > CACHE_TTL_MS) {
		return null;
	}
	if (!isCachedPayloadRaw(row.payload)) {
		return null;
	}
	return row.payload;
}

async function writeCache(
	db: Database,
	providerProfileId: ProviderProfileId,
	rangeDays: DashboardRangeDays,
	payload: CachedPayloadRaw,
	now: Date
): Promise<void> {
	await db.execute(sql`
		INSERT INTO provider_analytics.dashboard_metric_cache (
			provider_profile_id, range_days, computed_at, payload
		) VALUES (
			${providerProfileId}::uuid,
			${rangeDays},
			${now.toISOString()}::timestamptz,
			${JSON.stringify(payload)}::jsonb
		)
		ON CONFLICT (provider_profile_id, range_days) DO UPDATE
		SET computed_at = EXCLUDED.computed_at,
		    payload = EXCLUDED.payload
	`);
}

export async function computeDashboardMetrics(
	db: Database,
	providerProfileId: ProviderProfileId,
	rangeDays: DashboardRangeDays,
	now: Date,
	providerTagIds: Set<string>
): Promise<ProviderDashboardView> {
	const cached = await readCache(db, providerProfileId, rangeDays, now);
	if (cached) {
		return {
			...serializeCachedPayload(cached, providerTagIds),
			definitions: METRIC_DEFINITIONS
		};
	}

	const currentEnd = addUtcDays(startOfUtcDay(now), 1);
	const currentStart = addUtcDays(currentEnd, -rangeDays);
	const priorEnd = currentStart;
	const priorStart = addUtcDays(priorEnd, -rangeDays);

	const [currentRows, priorRows, mostSearched] = await Promise.all([
		queryDailyRollups(db, providerProfileId, currentStart, currentEnd),
		queryDailyRollups(db, providerProfileId, priorStart, priorEnd),
		queryMostSearchedServices(db, currentStart, currentEnd, providerTagIds)
	]);

	const payload: CachedPayloadRaw = {
		rangeDays,
		profileViews: buildMetricRaw(currentRows, 'profile_views', currentStart, currentEnd, priorRows),
		searchAppearances: buildMetricRaw(
			currentRows,
			'search_appearances',
			currentStart,
			currentEnd,
			priorRows
		),
		contactRequests: buildMetricRaw(
			currentRows,
			'contact_requests',
			currentStart,
			currentEnd,
			priorRows
		),
		mostSearchedServices: mostSearched
	};

	await writeCache(db, providerProfileId, rangeDays, payload, now);

	return {
		...serializeCachedPayload(payload, providerTagIds),
		definitions: METRIC_DEFINITIONS
	};
}

async function queryMostSearchedServices(
	db: Database,
	rangeStart: Date,
	rangeEnd: Date,
	providerTagIds: Set<string>
): Promise<MostSearchedServiceView[]> {
	const result = await db.execute(sql`
		SELECT
			tag_id::text AS tag_id,
			tag.name AS tag_name,
			COUNT(*)::int AS demand
		FROM provider_analytics.raw_event e,
		     jsonb_array_elements_text(e.metadata->'serviceTagIds') AS tag_id
		LEFT JOIN provider_profile.service_tag tag ON tag.id = tag_id::uuid
		WHERE e.event_type = 'search_filter_applied'
		  AND e.occurred_at >= ${rangeStart.toISOString()}::timestamptz
		  AND e.occurred_at < ${rangeEnd.toISOString()}::timestamptz
		GROUP BY tag_id, tag.name
		ORDER BY demand DESC, tag.name ASC
		LIMIT 5
	`);
	const rows = ((
		result as unknown as {
			rows?: Array<{ tag_id: string; tag_name: string | null; demand: number }>;
		}
	).rows ?? result) as Array<{ tag_id: string; tag_name: string | null; demand: number }>;

	return highlightOwnServiceTags(
		rows.map((row, index) => ({
			tagId: row.tag_id,
			tag: row.tag_name ?? 'Unknown service',
			demandRank: index + 1
		})),
		providerTagIds
	);
}
