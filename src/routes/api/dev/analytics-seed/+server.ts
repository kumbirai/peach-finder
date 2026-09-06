import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

export const _requiredRole: Role = 'anonymous';

/** Dev-only: seed analytics rollups for US-ANLY-01 Playwright. */
export const POST: RequestHandler = async () => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const db = getDb();
	const profileId = SEED_DUAL_ROLE_PROFILE_ID;
	const now = new Date();

	await db.execute(sql`
		DELETE FROM provider_analytics.dashboard_metric_cache
		WHERE provider_profile_id = ${profileId}::uuid
	`);

	await db.execute(sql`
		INSERT INTO provider_analytics.hourly_rollup (
			provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
		) VALUES
			(${profileId}::uuid, ${new Date('2026-09-05T10:00:00.000Z').toISOString()}::timestamptz, 42, 86, 6),
			(${profileId}::uuid, ${new Date('2026-09-04T10:00:00.000Z').toISOString()}::timestamptz, 18, 40, 2),
			(${profileId}::uuid, ${new Date('2026-08-20T10:00:00.000Z').toISOString()}::timestamptz, 10, 22, 1)
		ON CONFLICT (provider_profile_id, hour_bucket) DO UPDATE
		SET profile_views = EXCLUDED.profile_views,
		    search_appearances = EXCLUDED.search_appearances,
		    contact_requests = EXCLUDED.contact_requests
	`);

	await db.execute(sql`
		INSERT INTO provider_analytics.raw_event (
			id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
		) VALUES (
			gen_random_uuid(),
			'search_filter_applied',
			NULL,
			NULL,
			${new Date('2026-09-04T10:00:00.000Z').toISOString()}::timestamptz,
			'{"serviceTagIds":["01900000-0000-7000-8000-000000000201"]}'::jsonb
		)
	`);

	return json({
		data: {
			providerProfileId: profileId,
			seededAt: now.toISOString()
		}
	});
};
