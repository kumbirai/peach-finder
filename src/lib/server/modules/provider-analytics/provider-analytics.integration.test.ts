import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId, type ProviderProfileId } from '../../shared/ids';
import { createAuthContext } from '../../shared/auth-context';
import { queryRows } from '../../shared/sql-result';
import {
	captureView,
	deriveViewerKey,
	formatCount,
	getDashboardForOwner,
	runHourlyAnalyticsRollup,
	purgeExpiredRawAnalyticsEvents
} from './index';
import { assertAggregateOnlyPayload } from './domain/analytics-privacy-contract';
import { getCaptureFailureCount, incrementCaptureFailures } from './infra/capture-metrics';

describe('US-ANLY-01 provider analytics integration', () => {
	it('TC-ANLY-01a: dashboard returns four metrics with trend and prior comparison', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const hour = new Date('2026-09-05T10:00:00.000Z');

			await db.execute(sql`
				INSERT INTO provider_analytics.hourly_rollup (
					provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
				) VALUES
					(${profileId}::uuid, ${hour.toISOString()}::timestamptz, 12, 20, 3),
					(${profileId}::uuid, ${new Date('2026-07-10T10:00:00.000Z').toISOString()}::timestamptz, 4, 2, 1)
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

			const dashboard = await getDashboardForOwner(
				db,
				asId<'UserId'>('01900000-0000-7000-8000-000000000098'),
				30,
				now
			);

			expect(dashboard).not.toBeNull();
			expect(dashboard?.profileViews.currentTotal).toBe('12');
			expect(dashboard?.searchAppearances.currentTotal).toBe('20');
			expect(dashboard?.contactRequests.currentTotal).toBe('< 5');
			expect(dashboard?.profileViews.trend.length).toBeGreaterThan(0);
			expect(dashboard?.profileViews.priorPeriodComparison.priorTotal).toBeTruthy();
			expect(dashboard?.mostSearchedServices[0]?.tag).toBe('Deep tissue');
		});
	});

	it('dedup: two profile views same viewer/day produce one raw_event row', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const auth = createAuthContext({
				userId: asId<'UserId'>('01900000-0000-7000-8000-000000000002'),
				role: 'seeker',
				sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000902'),
				ipAddress: '127.0.0.1'
			});
			const occurredAt = new Date('2026-09-06T09:00:00.000Z');
			const viewerKey = deriveViewerKey(auth, 'anon-cookie', occurredAt);

			await captureView(db, profileId, viewerKey, occurredAt);
			await captureView(db, profileId, viewerKey, occurredAt);

			const rows = await db.execute(sql`
				SELECT COUNT(*)::int AS count
				FROM provider_analytics.raw_event
				WHERE provider_profile_id = ${profileId}::uuid
				  AND event_type = 'profile_view'
			`);
			const count = Number(queryRows(rows)[0]?.count ?? 0);
			expect(count).toBe(1);
		});
	});

	it('fire-and-forget: capture failures are swallowed and counted', async () => {
		incrementCaptureFailures('reset-marker');
		const before = getCaptureFailureCount();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = 'not-a-valid-uuid' as ProviderProfileId;
			const auth = createAuthContext({
				userId: null,
				role: 'anonymous',
				sessionId: null,
				ipAddress: '127.0.0.1'
			});
			const viewerKey = deriveViewerKey(auth, 'anon', new Date());
			await captureView(db, profileId, viewerKey);
		});
		expect(getCaptureFailureCount()).toBeGreaterThan(before);
	});

	it('rollup idempotency: re-running the same hour does not double-count', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const hourStart = new Date('2026-09-05T10:00:00.000Z');
			const hourEnd = new Date('2026-09-05T11:00:00.000Z');

			await db.execute(sql`
				INSERT INTO provider_analytics.raw_event (
					id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
				) VALUES (
					gen_random_uuid(), 'profile_view', ${profileId}::uuid, 'viewer-a', ${hourStart.toISOString()}::timestamptz, '{}'::jsonb
				)
			`);

			await runHourlyAnalyticsRollup(db, hourStart, hourEnd);
			await runHourlyAnalyticsRollup(db, hourStart, hourEnd);

			const rows = await db.execute(sql`
				SELECT profile_views::int AS profile_views
				FROM provider_analytics.hourly_rollup
				WHERE provider_profile_id = ${profileId}::uuid
				  AND hour_bucket = date_trunc('hour', ${hourStart.toISOString()}::timestamptz)
			`);
			const profileViews = Number(queryRows(rows)[0]?.profile_views ?? 0);
			expect(profileViews).toBe(1);
		});
	});

	it('TC-ANLY-02a: dashboard API payload is aggregate-only with no viewer identification', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			await db.execute(sql`
				INSERT INTO provider_analytics.hourly_rollup (
					provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
				) VALUES (
					${profileId}::uuid, ${new Date('2026-09-05T10:00:00.000Z').toISOString()}::timestamptz, 12, 8, 2
				)
			`);

			const dashboard = await getDashboardForOwner(
				db,
				asId<'UserId'>('01900000-0000-7000-8000-000000000098'),
				30,
				new Date('2026-09-06T12:00:00.000Z')
			);

			expect(dashboard).not.toBeNull();
			assertAggregateOnlyPayload(dashboard);
			const serialized = JSON.stringify(dashboard);
			expect(serialized).not.toMatch(/viewer_key|viewerKey|seekerId|seeker_id/);
		});
	});

	it('TC-ANLY-02b: dashboard floors small counts at read time', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			await db.execute(sql`
				INSERT INTO provider_analytics.hourly_rollup (
					provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
				) VALUES (
					${profileId}::uuid, ${new Date('2026-09-05T10:00:00.000Z').toISOString()}::timestamptz, 3, 0, 0
				)
			`);

			const dashboard = await getDashboardForOwner(
				db,
				asId<'UserId'>('01900000-0000-7000-8000-000000000098'),
				7,
				new Date('2026-09-06T12:00:00.000Z')
			);

			expect(dashboard?.profileViews.currentTotal).toBe(formatCount(3));
			expect(dashboard?.profileViews.currentTotal).toBe('< 5');
			expect(dashboard?.profileViews.priorPeriodComparison.changeLabel).not.toMatch(/%/);
		});
	});

	it('dashboard cache stores raw counts and re-applies the privacy floor on read', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const ownerId = asId<'UserId'>('01900000-0000-7000-8000-000000000098');
			const now = new Date('2026-09-06T12:00:00.000Z');

			await db.execute(sql`
				INSERT INTO provider_analytics.hourly_rollup (
					provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
				) VALUES (
					${profileId}::uuid, ${new Date('2026-09-05T10:00:00.000Z').toISOString()}::timestamptz, 3, 0, 0
				)
			`);

			const first = await getDashboardForOwner(db, ownerId, 7, now);
			const second = await getDashboardForOwner(db, ownerId, 7, now);

			expect(first?.profileViews.currentTotal).toBe('< 5');
			expect(second?.profileViews.currentTotal).toBe('< 5');

			const cacheRow = await db.execute(sql`
				SELECT payload
				FROM provider_analytics.dashboard_metric_cache
				WHERE provider_profile_id = ${profileId}::uuid
				  AND range_days = 7
				LIMIT 1
			`);
			const payload = queryRows(cacheRow)[0]?.payload as {
				profileViews?: { currentCount?: number };
			};
			expect(payload.profileViews?.currentCount).toBe(3);
		});
	});
});

describe('US-ANLY-03 demand signal I can act on', () => {
	it('TC-ANLY-03a: most-searched services highlight provider-owned tags', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const swedishTagId = '01900000-0000-7000-8000-000000000202';
			const deepTissueTagId = '01900000-0000-7000-8000-000000000201';
			const sportsTagId = '01900000-0000-7000-8000-000000000203';
			const occurredAt = new Date('2026-09-04T10:00:00.000Z');
			const now = new Date('2026-09-06T12:00:00.000Z');

			for (let i = 0; i < 12; i += 1) {
				await db.execute(sql`
					INSERT INTO provider_analytics.raw_event (
						id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
					) VALUES (
						gen_random_uuid(), 'search_filter_applied', NULL, NULL,
						${occurredAt.toISOString()}::timestamptz,
						${JSON.stringify({ serviceTagIds: [deepTissueTagId] })}::jsonb
					)
				`);
			}
			for (let i = 0; i < 6; i += 1) {
				await db.execute(sql`
					INSERT INTO provider_analytics.raw_event (
						id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
					) VALUES (
						gen_random_uuid(), 'search_filter_applied', NULL, NULL,
						${occurredAt.toISOString()}::timestamptz,
						${JSON.stringify({ serviceTagIds: [sportsTagId] })}::jsonb
					)
				`);
			}
			for (let i = 0; i < 3; i += 1) {
				await db.execute(sql`
					INSERT INTO provider_analytics.raw_event (
						id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
					) VALUES (
						gen_random_uuid(), 'search_filter_applied', NULL, NULL,
						${occurredAt.toISOString()}::timestamptz,
						${JSON.stringify({ serviceTagIds: [swedishTagId] })}::jsonb
					)
				`);
			}

			const dashboard = await getDashboardForOwner(
				db,
				asId<'UserId'>('01900000-0000-7000-8000-000000000098'),
				30,
				now
			);

			expect(dashboard?.mostSearchedServices[0]?.tag).toBe('Deep tissue');
			expect(dashboard?.mostSearchedServices[0]?.isMine).toBe(false);
			const swedish = dashboard?.mostSearchedServices.find((row) => row.tag === 'Swedish');
			expect(swedish?.isMine).toBe(true);
			expect(swedish?.demandRank).toBe(3);
			const sports = dashboard?.mostSearchedServices.find((row) => row.tag === 'Sports massage');
			expect(sports?.isMine).toBe(false);
		});
	});

	it('TC-ANLY-03a: cached demand tags re-apply ownership when provider tags change', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const ownerId = asId<'UserId'>('01900000-0000-7000-8000-000000000098');
			const swedishTagId = '01900000-0000-7000-8000-000000000202';
			const deepTissueTagId = '01900000-0000-7000-8000-000000000201';
			const occurredAt = new Date('2026-09-04T10:00:00.000Z');
			const now = new Date('2026-09-06T12:00:00.000Z');

			for (let i = 0; i < 5; i += 1) {
				await db.execute(sql`
					INSERT INTO provider_analytics.raw_event (
						id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
					) VALUES (
						gen_random_uuid(), 'search_filter_applied', NULL, NULL,
						${occurredAt.toISOString()}::timestamptz,
						${JSON.stringify({ serviceTagIds: [deepTissueTagId] })}::jsonb
					)
				`);
			}
			for (let i = 0; i < 3; i += 1) {
				await db.execute(sql`
					INSERT INTO provider_analytics.raw_event (
						id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
					) VALUES (
						gen_random_uuid(), 'search_filter_applied', NULL, NULL,
						${occurredAt.toISOString()}::timestamptz,
						${JSON.stringify({ serviceTagIds: [swedishTagId] })}::jsonb
					)
				`);
			}

			const first = await getDashboardForOwner(db, ownerId, 30, now);
			expect(first?.mostSearchedServices.find((row) => row.tag === 'Swedish')?.isMine).toBe(true);

			await db.execute(sql`
				DELETE FROM provider_profile.provider_service_tag
				WHERE provider_profile_id = ${profileId}::uuid
				  AND service_tag_id = ${swedishTagId}::uuid
			`);
			await db.execute(sql`
				INSERT INTO provider_profile.provider_service_tag (provider_profile_id, service_tag_id)
				VALUES (${profileId}::uuid, ${deepTissueTagId}::uuid)
				ON CONFLICT DO NOTHING
			`);

			const second = await getDashboardForOwner(db, ownerId, 30, now);
			expect(second?.mostSearchedServices.find((row) => row.tag === 'Swedish')?.isMine).toBe(false);
			expect(second?.mostSearchedServices.find((row) => row.tag === 'Deep tissue')?.isMine).toBe(
				true
			);
		});
	});
});

describe('US-ANLY-04 cause and effect on the chart', () => {
	it('TC-ANLY-04a: dashboard annotates charts with availability and featuring events', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const ownerId = asId<'UserId'>('01900000-0000-7000-8000-000000000098');
			const now = new Date('2026-09-06T12:00:00.000Z');

			await db.execute(sql`
				INSERT INTO provider_analytics.hourly_rollup (
					provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
				) VALUES (
					${profileId}::uuid, ${new Date('2026-09-05T10:00:00.000Z').toISOString()}::timestamptz, 12, 8, 2
				)
			`);

			const availabilityDays = [
				'2026-09-02T10:00:00.000Z',
				'2026-09-02T14:00:00.000Z',
				'2026-09-04T09:00:00.000Z',
				'2026-09-05T09:00:00.000Z',
				'2026-09-06T09:00:00.000Z'
			];
			for (const occurredAt of availabilityDays) {
				await db.execute(sql`
					INSERT INTO provider_availability.availability_history (
						id, provider_profile_id, event_type, occurred_at, set_at, correlation_id
					) VALUES (
						gen_random_uuid(),
						${profileId}::uuid,
						'set',
						${occurredAt}::timestamptz,
						${occurredAt}::timestamptz,
						gen_random_uuid()::text
					)
				`);
			}

			await db.execute(sql`
				INSERT INTO listing_billing.featuring_addon (
					id, provider_profile_id, state, current_period_ends_at, cancel_at_period_end, created_at, updated_at
				) VALUES (
					gen_random_uuid(),
					${profileId}::uuid,
					'active',
					${new Date('2026-10-06T12:00:00.000Z').toISOString()}::timestamptz,
					false,
					${new Date('2026-09-03T12:00:00.000Z').toISOString()}::timestamptz,
					${new Date('2026-09-03T12:00:00.000Z').toISOString()}::timestamptz
				)
			`);

			const dashboard = await getDashboardForOwner(db, ownerId, 7, now);

			expect(dashboard?.chartAnnotations.summaries).toEqual([
				{ type: 'went_available', label: 'Went available 5× this week' },
				{ type: 'featured', label: 'Featured since 3 Sep' }
			]);
			expect(dashboard?.chartAnnotations.markers).toContainEqual({
				date: '2026-09-02',
				type: 'went_available',
				label: 'Went available (2×)'
			});
			expect(dashboard?.chartAnnotations.markers).toContainEqual({
				date: '2026-09-03',
				type: 'featured',
				label: 'Featured'
			});
			assertAggregateOnlyPayload(dashboard);
		});
	});
});

describe('US-PRIV-03 raw analytics retention integration', () => {
	it('TC-PRIV-03d: raw analytics destroyed at 90 days while aggregates survive', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const at90 = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
			const at89 = new Date(now.getTime() - 89 * 24 * 60 * 60_000);

			await db.execute(sql`
				INSERT INTO provider_analytics.raw_event (
					id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
				) VALUES
					(gen_random_uuid(), 'profile_view', ${profileId}::uuid, 'viewer-old', ${at90.toISOString()}::timestamptz, '{}'::jsonb),
					(gen_random_uuid(), 'profile_view', ${profileId}::uuid, 'viewer-new', ${at89.toISOString()}::timestamptz, '{}'::jsonb)
			`);

			await db.execute(sql`
				INSERT INTO provider_analytics.hourly_rollup (
					provider_profile_id, hour_bucket, profile_views, search_appearances, contact_requests
				) VALUES (
					${profileId}::uuid, date_trunc('hour', ${at90.toISOString()}::timestamptz), 5, 0, 0
				)
			`);

			const purge = await purgeExpiredRawAnalyticsEvents(db, now);
			expect(purge.deleted).toBeGreaterThanOrEqual(1);

			const remaining = await db.execute(sql`
				SELECT COUNT(*)::int AS count
				FROM provider_analytics.raw_event
				WHERE provider_profile_id = ${profileId}::uuid
			`);
			expect(Number(queryRows(remaining)[0]?.count ?? 0)).toBe(1);

			const rollup = await db.execute(sql`
				SELECT profile_views::int AS profile_views
				FROM provider_analytics.hourly_rollup
				WHERE provider_profile_id = ${profileId}::uuid
				  AND hour_bucket = date_trunc('hour', ${at90.toISOString()}::timestamptz)
			`);
			expect(Number(queryRows(rollup)[0]?.profile_views ?? 0)).toBe(5);
		});
	});
});
