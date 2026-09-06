import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

const TAG_DEEP_TISSUE = '01900000-0000-7000-8000-000000000201';
const TAG_SWEDISH = '01900000-0000-7000-8000-000000000202';
const TAG_SPORTS = '01900000-0000-7000-8000-000000000203';

function startOfUtcDay(instant: Date): Date {
	return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

function addUtcDays(instant: Date, days: number): Date {
	const next = new Date(instant);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function atUtcHour(day: Date, hour: number): Date {
	return new Date(
		Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 0, 0, 0)
	);
}

/** Align TC-ANLY-04a fixture dates with the live dashboard 7-day UTC window. */
function chartAnnotationFixtureDates(now: Date): {
	rollupAt: Date;
	availabilityAt: Date[];
	featuringActivatedAt: Date;
	featuringPeriodEndsAt: Date;
} {
	const rangeEnd = addUtcDays(startOfUtcDay(now), 1);
	const rangeStart = addUtcDays(rangeEnd, -7);
	const availabilityDayOffsets = [
		{ dayOffset: 2, hour: 10 },
		{ dayOffset: 2, hour: 14 },
		{ dayOffset: 4, hour: 9 },
		{ dayOffset: 5, hour: 9 },
		{ dayOffset: 6, hour: 9 }
	];

	return {
		rollupAt: atUtcHour(addUtcDays(rangeEnd, -2), 10),
		availabilityAt: availabilityDayOffsets.map(({ dayOffset, hour }) =>
			atUtcHour(addUtcDays(rangeStart, dayOffset), hour)
		),
		featuringActivatedAt: atUtcHour(addUtcDays(rangeStart, 3), 12),
		featuringPeriodEndsAt: addUtcDays(now, 30)
	};
}

async function seedDemandFilterEvents(
	db: ReturnType<typeof getDb>,
	occurredAt: Date,
	tagCounts: Array<{ tagId: string; count: number }>
): Promise<void> {
	for (const { tagId, count } of tagCounts) {
		for (let i = 0; i < count; i += 1) {
			await db.execute(sql`
				INSERT INTO provider_analytics.raw_event (
					id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
				) VALUES (
					gen_random_uuid(),
					'search_filter_applied',
					NULL,
					NULL,
					${occurredAt.toISOString()}::timestamptz,
					${JSON.stringify({ serviceTagIds: [tagId] })}::jsonb
				)
			`);
		}
	}
}

export const _requiredRole: Role = 'anonymous';

/** Dev-only: seed analytics rollups for US-ANLY-01/02/03/04 Playwright. */
export const POST: RequestHandler = async ({ url }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const db = getDb();
	const profileId = SEED_DUAL_ROLE_PROFILE_ID;
	const now = new Date();
	const scenario = url.searchParams.get('scenario');

	await db.execute(sql`
		DELETE FROM provider_analytics.dashboard_metric_cache
		WHERE provider_profile_id = ${profileId}::uuid
	`);

	if (scenario === 'chart-annotations') {
		const fixture = chartAnnotationFixtureDates(now);

		await db.execute(sql`
			DELETE FROM provider_analytics.hourly_rollup
			WHERE provider_profile_id = ${profileId}::uuid
		`);
		await db.execute(sql`
			INSERT INTO provider_analytics.hourly_rollup (
				provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
			) VALUES (
				${profileId}::uuid, ${fixture.rollupAt.toISOString()}::timestamptz, 42, 86, 6
			)
			ON CONFLICT (provider_profile_id, hour_bucket) DO UPDATE
			SET profile_views = EXCLUDED.profile_views,
			    search_appearances = EXCLUDED.search_appearances,
			    contact_requests = EXCLUDED.contact_requests
		`);

		await db.execute(sql`
			DELETE FROM provider_availability.availability_history
			WHERE provider_profile_id = ${profileId}::uuid
		`);
		for (const occurredAt of fixture.availabilityAt) {
			await db.execute(sql`
				INSERT INTO provider_availability.availability_history (
					id, provider_profile_id, event_type, occurred_at, set_at, correlation_id
				) VALUES (
					gen_random_uuid(),
					${profileId}::uuid,
					'set',
					${occurredAt.toISOString()}::timestamptz,
					${occurredAt.toISOString()}::timestamptz,
					gen_random_uuid()::text
				)
			`);
		}

		await db.execute(sql`
			DELETE FROM listing_billing.featuring_addon
			WHERE provider_profile_id = ${profileId}::uuid
		`);
		await db.execute(sql`
			INSERT INTO listing_billing.featuring_addon (
				id, provider_profile_id, state, current_period_ends_at, cancel_at_period_end, created_at, updated_at
			) VALUES (
				gen_random_uuid(),
				${profileId}::uuid,
				'active',
				${fixture.featuringPeriodEndsAt.toISOString()}::timestamptz,
				false,
				${fixture.featuringActivatedAt.toISOString()}::timestamptz,
				${fixture.featuringActivatedAt.toISOString()}::timestamptz
			)
		`);
	} else if (scenario === 'privacy-floor') {
		await db.execute(sql`
			DELETE FROM provider_analytics.hourly_rollup
			WHERE provider_profile_id = ${profileId}::uuid
		`);
		await db.execute(sql`
			INSERT INTO provider_analytics.hourly_rollup (
				provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
			) VALUES (
				${profileId}::uuid, ${new Date('2026-09-05T10:00:00.000Z').toISOString()}::timestamptz, 3, 2, 1
			)
			ON CONFLICT (provider_profile_id, hour_bucket) DO UPDATE
			SET profile_views = EXCLUDED.profile_views,
			    search_appearances = EXCLUDED.search_appearances,
			    contact_requests = EXCLUDED.contact_requests
		`);
	} else {
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
	}

	await db.execute(sql`
		DELETE FROM provider_analytics.raw_event
		WHERE event_type = 'search_filter_applied'
	`);

	const demandOccurredAt = new Date('2026-09-04T10:00:00.000Z');
	if (scenario === 'demand-signal') {
		// Dual-role provider offers Swedish only; Deep tissue tops demand (TC-ANLY-03a).
		await seedDemandFilterEvents(db, demandOccurredAt, [
			{ tagId: TAG_DEEP_TISSUE, count: 12 },
			{ tagId: TAG_SPORTS, count: 6 },
			{ tagId: TAG_SWEDISH, count: 3 }
		]);
	} else {
		await seedDemandFilterEvents(db, demandOccurredAt, [{ tagId: TAG_DEEP_TISSUE, count: 5 }]);
	}

	return json({
		data: {
			providerProfileId: profileId,
			scenario: scenario ?? 'default',
			seededAt: now.toISOString()
		}
	});
};
