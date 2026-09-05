import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../../db/test-harness';
import { seedCore } from '../../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { hashSessionToken } from '../../identity-and-access';
import { sessions } from '../../identity-and-access/infra/schema';
import { providerProfiles } from '../../provider-profile/infra/schema';
import { searchProjection } from '../../discovery-search/infra/schema';
import { asId, newId, type ProviderProfileId } from '../../../shared/ids';
import type { Database } from '../../../db';
import { handleBadgeFlagEvent } from './identity-change-subscription';
import { badgeState } from './schema';
import { loadBadgeDisplayState } from './badge-read';
import { evaluateActiveThisWeekSignals, runActiveThisWeekJob } from './active-this-week-job';
import { claimUndispatched } from '../../../shared/outbox';

const ZANELE_PROFILE_ID = '01900000-0000-7000-8000-000000000105' as ProviderProfileId;
const ZANELE_USER_ID = '01900000-0000-7000-8000-000000000005';

async function dispatchBadgeEvents(db: Database): Promise<void> {
	const rows = await claimUndispatched(db, 200);
	for (const row of rows) {
		if (row.eventName === 'BadgeGranted' || row.eventName === 'BadgeRevoked') {
			await handleBadgeFlagEvent(db, {
				eventId: row.eventId,
				eventName: row.eventName,
				version: row.version,
				occurredAt: row.occurredAt.toISOString(),
				correlationId: row.correlationId,
				payload: row.payload
			} as never);
		}
	}
}

describe('US-AVAIL-04 active this week job', () => {
	it('TC-AVAIL-04a: grants badge when only sign-in occurred in the trailing 7 days', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-05T12:00:00.000Z');
			const recentSignIn = new Date('2026-09-04T10:00:00.000Z');
			const staleProfileEdit = new Date('2026-08-20T10:00:00.000Z');

			await db
				.update(providerProfiles)
				.set({ updatedAt: staleProfileEdit })
				.where(eq(providerProfiles.id, ZANELE_PROFILE_ID));

			await db.insert(sessions).values({
				id: newId(),
				userId: ZANELE_USER_ID,
				tokenHash: hashSessionToken(`active-week-${Date.now()}`),
				createdAt: recentSignIn,
				lastSeenAt: recentSignIn,
				expiresAt: new Date('2026-09-12T12:00:00.000Z'),
				ipAddress: '127.0.0.1'
			});

			const signals = await evaluateActiveThisWeekSignals(
				db,
				{
					providerProfileId: ZANELE_PROFILE_ID,
					ownerId: asId<'UserId'>(ZANELE_USER_ID)
				},
				new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
			);
			expect(signals.signedIn).toBe(true);
			expect(signals.availabilitySet).toBe(false);
			expect(signals.profileEdited).toBe(false);
			expect(signals.messageSent).toBe(false);

			const before = await loadBadgeDisplayState(db, ZANELE_PROFILE_ID);
			expect(before.activeThisWeek).toBe(false);

			const result = await runActiveThisWeekJob(db, now, 'corr-avail04-grant');
			expect(result.granted).toContain(ZANELE_PROFILE_ID);

			await dispatchBadgeEvents(db);

			const after = await loadBadgeDisplayState(db, ZANELE_PROFILE_ID);
			expect(after.activeThisWeek).toBe(true);

			const projection = await db
				.select({ badgeActiveThisWeek: searchProjection.badgeActiveThisWeek })
				.from(searchProjection)
				.where(eq(searchProjection.providerProfileId, ZANELE_PROFILE_ID));
			expect(projection[0]?.badgeActiveThisWeek).toBe(true);
		});
	});

	it('revokes badge when all four signals are absent in the trailing 7 days', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const leratoProfileId = '01900000-0000-7000-8000-000000000103' as ProviderProfileId;
			const now = new Date('2026-10-15T12:00:00.000Z');
			const staleProfileEdit = new Date('2026-08-20T10:00:00.000Z');

			await db
				.update(providerProfiles)
				.set({ updatedAt: staleProfileEdit })
				.where(eq(providerProfiles.id, leratoProfileId));

			await db
				.update(badgeState)
				.set({
					activeThisWeek: true,
					activeThisWeekSince: new Date('2026-09-01T12:00:00.000Z'),
					updatedAt: now
				})
				.where(eq(badgeState.providerProfileId, leratoProfileId));

			const signals = await evaluateActiveThisWeekSignals(
				db,
				{
					providerProfileId: leratoProfileId,
					ownerId: asId<'UserId'>('01900000-0000-7000-8000-000000000003')
				},
				new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
			);
			expect(signals.signedIn).toBe(false);
			expect(signals.availabilitySet).toBe(false);
			expect(signals.profileEdited).toBe(false);
			expect(signals.messageSent).toBe(false);

			const result = await runActiveThisWeekJob(db, now, 'corr-avail04-revoke');
			expect(result.revoked).toContain(leratoProfileId);

			await dispatchBadgeEvents(db);

			const after = await loadBadgeDisplayState(db, leratoProfileId);
			expect(after.activeThisWeek).toBe(false);

			const projection = await db
				.select({ badgeActiveThisWeek: searchProjection.badgeActiveThisWeek })
				.from(searchProjection)
				.where(eq(searchProjection.providerProfileId, leratoProfileId));
			expect(projection[0]?.badgeActiveThisWeek).toBe(false);
		});
	});

	it('is idempotent when badge state already matches computed activity', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const thandiProfileId = '01900000-0000-7000-8000-000000000102' as ProviderProfileId;
			const now = new Date('2026-09-05T12:00:00.000Z');

			const first = await runActiveThisWeekJob(db, now, 'corr-avail04-idem-1');
			expect(first.granted).toContain(thandiProfileId);

			const second = await runActiveThisWeekJob(db, now, 'corr-avail04-idem-2');
			expect(second.granted).not.toContain(thandiProfileId);
			expect(second.revoked).not.toContain(thandiProfileId);
		});
	});
});
