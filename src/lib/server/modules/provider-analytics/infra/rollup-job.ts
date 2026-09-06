import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';

export async function runHourlyAnalyticsRollup(
	db: Database,
	hourStart: Date,
	hourEnd: Date
): Promise<{ providers: number }> {
	const result = await db.execute(sql`
		INSERT INTO provider_analytics.hourly_rollup (
			provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
		)
		SELECT
			provider_profile_id,
			date_trunc('hour', occurred_at) AS hour_bucket,
			COUNT(*) FILTER (WHERE event_type = 'profile_view')::int AS profile_views,
			COUNT(*) FILTER (WHERE event_type = 'search_appearance')::int AS search_appearances,
			COUNT(*) FILTER (WHERE event_type IN ('contact_request', 'tap_to_call'))::int AS contact_requests
		FROM provider_analytics.raw_event
		WHERE occurred_at >= ${hourStart.toISOString()}::timestamptz
		  AND occurred_at < ${hourEnd.toISOString()}::timestamptz
		  AND provider_profile_id IS NOT NULL
		GROUP BY provider_profile_id, date_trunc('hour', occurred_at)
		ON CONFLICT (provider_profile_id, hour_bucket) DO UPDATE
		SET profile_views = EXCLUDED.profile_views,
		    search_appearances = EXCLUDED.search_appearances,
		    contact_requests = EXCLUDED.contact_requests
		RETURNING provider_profile_id
	`);
	const rows = ((result as unknown as { rows?: unknown[] }).rows ?? result) as unknown[];
	return { providers: rows.length };
}

export async function purgeExpiredRawAnalyticsEvents(
	db: Database,
	now: Date
): Promise<{ deleted: number }> {
	const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
	const result = await db.execute(sql`
		DELETE FROM provider_analytics.raw_event
		WHERE occurred_at <= ${cutoff.toISOString()}::timestamptz
		RETURNING id
	`);
	const rows = ((result as unknown as { rows?: unknown[] }).rows ?? result) as unknown[];
	return { deleted: rows.length };
}

export async function runAnalyticsMaintenanceTick(
	db: Database,
	now: Date
): Promise<{ rolledUpProviders: number; purgedRawEvents: number }> {
	const hourEnd = new Date(now);
	hourEnd.setUTCMinutes(0, 0, 0);
	const hourStart = new Date(hourEnd);
	hourStart.setUTCHours(hourStart.getUTCHours() - 1);

	const rollup = await runHourlyAnalyticsRollup(db, hourStart, hourEnd);
	const purge = await purgeExpiredRawAnalyticsEvents(db, now);
	return {
		rolledUpProviders: rollup.providers,
		purgedRawEvents: purge.deleted
	};
}
