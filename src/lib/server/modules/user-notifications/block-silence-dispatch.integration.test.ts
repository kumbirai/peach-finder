import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { mirrorNotifBlock } from './infra/block-cache';
import { recordNotification } from './infra/dispatch';
import { notificationLog } from './infra/schema';

describe('block-silence dispatch chokepoint', () => {
	it('writes zero rows when the actor is blocked from the recipient', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const recipient = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const actor = asId<'UserId'>('01900000-0000-7000-8000-000000000002');
			await mirrorNotifBlock(db, recipient, actor, new Date());

			await db.transaction(async (tx) => {
				await recordNotification(tx, {
					userId: recipient,
					category: 'review_received',
					channels: ['email', 'in_app'],
					title: 'New review',
					body: 'Should be silenced',
					deepLinkPath: '/provider/reviews',
					correlationId: 'block-silence-chokepoint',
					now: new Date(),
					actorUserId: actor
				});
			});

			const rows = await db
				.select({ id: notificationLog.id })
				.from(notificationLog)
				.where(eq(notificationLog.correlationId, 'block-silence-chokepoint'));
			expect(rows).toHaveLength(0);
		});
	});
});
