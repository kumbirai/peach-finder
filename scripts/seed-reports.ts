import type { Database } from '../src/lib/server/db';
import { inArray, eq } from 'drizzle-orm';
import { seedCore } from './seed-core';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';
import {
	reports,
	moderationActions
} from '../src/lib/server/modules/trust-and-safety/infra/schema';
import { providerProfiles } from '../src/lib/server/modules/provider-profile/infra/schema';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_ADMIN_USER_ID
} from './seed-core';
import {
	SEED_REPORT_ACTED_ID,
	SEED_REPORT_ACT_OPEN_ID,
	SEED_REPORT_DISMISSED_ID,
	SEED_REPORT_NEW_OPEN_ID,
	SEED_REPORT_OLD_OPEN_ID,
	SEED_REPORT_THREAD_ID,
	SEED_REPORT_THREAD_OPEN_ID
} from './seed-reports-constants';

export {
	SEED_REPORT_OLD_OPEN_ID,
	SEED_REPORT_NEW_OPEN_ID,
	SEED_REPORT_THREAD_OPEN_ID,
	SEED_REPORT_ACT_OPEN_ID,
	SEED_REPORT_DISMISSED_ID,
	SEED_REPORT_ACTED_ID,
	SEED_REPORT_THREAD_ID
} from './seed-reports-constants';

export async function seedReports(db: Database): Promise<void> {
	await seedCore(db);

	const oldCreatedAt = new Date('2026-09-03T08:00:00.000Z');
	const newCreatedAt = new Date('2026-09-05T18:00:00.000Z');
	const threadCreatedAt = new Date('2026-09-05T12:00:00.000Z');
	const dismissedAt = new Date('2026-09-04T10:00:00.000Z');
	const actedAt = new Date('2026-09-04T11:00:00.000Z');

	const reviewerId = '01900000-0000-7000-8000-000000000099';
	const actTargetProfileId = SEED_DUAL_ROLE_PROFILE_ID;

	const seedIds = [
		SEED_REPORT_OLD_OPEN_ID,
		SEED_REPORT_NEW_OPEN_ID,
		SEED_REPORT_THREAD_OPEN_ID,
		SEED_REPORT_ACT_OPEN_ID,
		SEED_REPORT_DISMISSED_ID,
		SEED_REPORT_ACTED_ID
	];
	await db.delete(moderationActions).where(inArray(moderationActions.reportId, seedIds));
	await db.delete(reports).where(inArray(reports.id, seedIds));

	await db
		.update(providerProfiles)
		.set({
			publishState: 'published',
			unpublishReason: null,
			updatedAt: new Date('2026-09-06T08:00:00.000Z')
		})
		.where(
			inArray(providerProfiles.id, [SEED_CORE_PRIMARY_PROFILE_ID, actTargetProfileId])
		);

	await db.insert(reports).values([
		{
			id: SEED_REPORT_OLD_OPEN_ID,
			reporterId: reviewerId,
			targetType: 'profile',
			targetId: SEED_CORE_PRIMARY_PROFILE_ID,
			reason: 'fake_profile_photos',
			freeText: 'Photos look stock.',
			status: 'open',
			createdAt: oldCreatedAt
		},
		{
			id: SEED_REPORT_NEW_OPEN_ID,
			reporterId: SEED_DUAL_ROLE_USER_ID,
			targetType: 'profile',
			targetId: SEED_CORE_PRIMARY_PROFILE_ID,
			reason: 'spam_scam',
			freeText: null,
			status: 'open',
			createdAt: newCreatedAt
		},
		{
			id: SEED_REPORT_THREAD_OPEN_ID,
			reporterId: SEED_DUAL_ROLE_USER_ID,
			targetType: 'thread',
			targetId: SEED_REPORT_THREAD_ID,
			reason: 'harassment',
			freeText: 'Uncomfortable messages in thread.',
			status: 'open',
			createdAt: threadCreatedAt
		},
		{
			id: SEED_REPORT_ACT_OPEN_ID,
			reporterId: SEED_DUAL_ROLE_USER_ID,
			targetType: 'profile',
				targetId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'safety_concern',
				freeText: 'Needs admin action path.',
				status: 'open',
				createdAt: new Date('2026-09-05T09:00:00.000Z')
			},
		{
			id: SEED_REPORT_DISMISSED_ID,
			reporterId: reviewerId,
			targetType: 'profile',
			targetId: SEED_CORE_PRIMARY_PROFILE_ID,
			reason: 'other',
			freeText: 'Already closed.',
			status: 'dismissed',
			resolvedAt: dismissedAt,
			resolvedBy: SEED_ADMIN_USER_ID,
			resolutionNote: 'Reviewed — no policy violation.',
			createdAt: new Date('2026-09-01T08:00:00.000Z')
		},
		{
			id: SEED_REPORT_ACTED_ID,
			reporterId: SEED_DUAL_ROLE_USER_ID,
			targetType: 'profile',
			targetId: SEED_CORE_PRIMARY_PROFILE_ID,
			reason: 'harassment',
			freeText: 'Historical acted report.',
			status: 'acted',
			resolvedAt: actedAt,
			resolvedBy: SEED_ADMIN_USER_ID,
			resolutionNote: 'Unpublished after review.',
			createdAt: new Date('2026-08-28T08:00:00.000Z')
		}
	]);
}

async function main(): Promise<void> {
	const { getDb, closeDb } = await import('../src/lib/server/db');
	const db = getDb();
	await seedPlatform(db);
	await loadConfigCache(db);
	await seedReports(db);
	console.info('seed-reports complete');
	await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
