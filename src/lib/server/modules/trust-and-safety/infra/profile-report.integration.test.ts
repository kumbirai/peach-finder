import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../../scripts/seed-core';
import { asId } from '../../../shared/ids';
import { anonymousAuth } from '../../../shared/auth-context';
import { getPublicProfile } from '../../provider-profile';
import { sendOrHoldMessage } from '../../direct-messaging';
import { providerProfiles } from '../../provider-profile/infra/schema';
import { badgeState } from '../infra/schema';
import { fileReport } from '../app/file-report';
import { reports } from '../infra/schema';
import type { Database } from '../../../db';
import { users } from '../../identity-and-access/infra/schema';

async function seedSeeker(db: Database, id: string, displayName: string): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			displayName,
			email: `${id}@example.com`,
			emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
			status: 'active'
		})
		.onConflictDoNothing();
}

describe('US-SAFE-01 profile reports', () => {
	it('TC-SAFE-01c backend: filing a profile report leaves publish and badge state unchanged', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a701');
			await seedSeeker(db, seekerId, 'Safe01 Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T14:00:00Z');

			const beforeProfile = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, providerProfileId));
			const beforeBadge = await db
				.select()
				.from(badgeState)
				.where(eq(badgeState.providerProfileId, providerProfileId));

			const publicBefore = await getPublicProfile(
				db,
				providerProfileId,
				anonymousAuth('127.0.0.1')
			);
			expect(publicBefore.ok).toBe(true);

			const report = await fileReport(db, {
				reporterId: seekerId,
				targetType: 'profile',
				targetId: providerProfileId,
				reason: 'safety_concern',
				freeText: 'Concerned about conduct',
				now,
				correlationId: 'corr-safe01-profile'
			});
			expect(report.ok).toBe(true);

			const afterProfile = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, providerProfileId));
			const afterBadge = await db
				.select()
				.from(badgeState)
				.where(eq(badgeState.providerProfileId, providerProfileId));
			const publicAfter = await getPublicProfile(db, providerProfileId, anonymousAuth('127.0.0.1'));

			expect(afterProfile).toEqual(beforeProfile);
			expect(afterBadge).toEqual(beforeBadge);
			expect(publicAfter.ok).toBe(true);
			if (publicBefore.ok && publicAfter.ok) {
				expect(publicAfter.value.badges).toEqual(publicBefore.value.badges);
				expect(publicAfter.value.displayName).toBe(publicBefore.value.displayName);
			}

			const reportRows = await db.select().from(reports).where(eq(reports.reporterId, seekerId));
			expect(reportRows).toHaveLength(1);
			expect(reportRows[0]?.status).toBe('open');
		});
	});

	it('rejects profile reports for unknown profiles', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a702');
			await seedSeeker(db, seekerId, 'Safe01 Outsider');
			const now = new Date('2026-09-05T14:00:00Z');

			const report = await fileReport(db, {
				reporterId: seekerId,
				targetType: 'profile',
				targetId: '01900000-0000-7000-8000-00000000ffff',
				reason: 'other',
				now,
				correlationId: 'corr-safe01-missing'
			});
			expect(report.ok).toBe(false);
			if (report.ok || report.error.kind !== 'not_found') {
				throw new Error('expected not_found for missing profile');
			}
		});
	});

	it('TC-SAFE-01 backend: multiple rapid profile reports do not change provider state', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T14:00:00Z');
			const reporterIds = [
				asId<'UserId'>('01900000-0000-7000-8000-00000000a703'),
				asId<'UserId'>('01900000-0000-7000-8000-00000000a704'),
				asId<'UserId'>('01900000-0000-7000-8000-00000000a705')
			];

			for (const [index, reporterId] of reporterIds.entries()) {
				await seedSeeker(db, reporterId, `Reporter ${index}`);
				const filed = await fileReport(db, {
					reporterId,
					targetType: 'profile',
					targetId: providerProfileId,
					reason: 'spam_scam',
					now: new Date(now.getTime() + index * 1000),
					correlationId: `corr-safe01-rapid-${index}`
				});
				expect(filed.ok).toBe(true);
			}

			const publishRow = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, providerProfileId));
			expect(publishRow[0]?.publishState).toBe('published');

			const openReports = await db
				.select()
				.from(reports)
				.where(eq(reports.targetId, providerProfileId));
			expect(openReports).toHaveLength(3);
			expect(openReports.every((row) => row.status === 'open')).toBe(true);
		});
	});

	it('TC-SAFE-01 backend: thread reports still require participation', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a706');
			await seedSeeker(db, seekerId, 'Safe01 Thread');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T14:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Report this thread',
				now,
				correlationId: 'corr-safe01-thread'
			});
			expect(sent.ok).toBe(true);
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const report = await fileReport(db, {
				reporterId: seekerId,
				targetType: 'thread',
				targetId: sent.value.threadId,
				reason: 'harassment',
				now,
				correlationId: 'corr-safe01-thread-report'
			});
			expect(report.ok).toBe(true);
		});
	});
});
