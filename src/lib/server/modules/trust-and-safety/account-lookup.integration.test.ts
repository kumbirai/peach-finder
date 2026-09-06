import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore, SEED_ADMIN_USER_ID } from '../../../../../scripts/seed-core';
import { seedReports } from '../../../../../scripts/seed-reports';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { getOwnedProfileIdDb } from '../provider-profile';
import { getAccountTrustSummary } from './infra/account-lookup-queries';
import { reports } from './infra/schema';
import { asId, newId } from '../../shared/ids';

describe('US-ADMIN-05 account trust summary integration', () => {
	it('TC-ADMIN-05a: includes open reports and moderation history for a provider', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const amaraUserId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const profileId = await getOwnedProfileIdDb(db, amaraUserId);
			expect(profileId).toBeTruthy();

			const trust = await getAccountTrustSummary(db, amaraUserId, profileId);
			expect(trust.openReportsCount).toBeGreaterThan(0);
			expect(trust.reportHistory.some((row) => row.role === 'received')).toBe(true);
		});
	});

	it('openReportsCount includes open reports beyond the history window', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReports(db);

			const amaraUserId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const profileId = await getOwnedProfileIdDb(db, amaraUserId);
			expect(profileId).toBeTruthy();

			const baseline = await getAccountTrustSummary(db, amaraUserId, profileId);
			const reviewerId = asId<'UserId'>('01900000-0000-7000-8000-000000000099');
			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const baseDate = new Date('2026-09-06T10:00:00.000Z');
			const resolvedAt = new Date('2026-09-06T11:00:00.000Z');

			for (let i = 0; i < 50; i += 1) {
				await db.insert(reports).values({
					id: newId<'ReportId'>(),
					reporterId: reviewerId,
					targetType: 'profile',
					targetId: profileId!,
					reason: 'other',
					status: 'dismissed',
					resolvedAt,
					resolvedBy: adminId,
					resolutionNote: 'Padding history window.',
					createdAt: new Date(baseDate.getTime() + i * 1000)
				});
			}

			await db.insert(reports).values({
				id: newId<'ReportId'>(),
				reporterId: reviewerId,
				targetType: 'profile',
				targetId: profileId!,
				reason: 'other',
				status: 'open',
				createdAt: new Date('2026-01-01T08:00:00.000Z')
			});

			const trust = await getAccountTrustSummary(db, amaraUserId, profileId);
			expect(trust.openReportsCount).toBe(baseline.openReportsCount + 1);
			expect(trust.reportHistory.length).toBeLessThanOrEqual(50);
		});
	});
});
