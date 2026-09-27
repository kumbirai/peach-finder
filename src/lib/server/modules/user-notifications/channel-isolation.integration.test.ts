import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_DUAL_ROLE_USER_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { armFailNextEmailChannel } from './infra/dispatch';
import { recordNotification } from './infra/dispatch';
import { notificationLog } from './infra/schema';

describe('notification channel isolation', () => {
	it('keeps in-app when the email adapter throws', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const userId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			armFailNextEmailChannel();

			await db.transaction(async (tx) => {
				await recordNotification(tx, {
					userId,
					category: 'billing_payment',
					channels: ['email', 'in_app'],
					title: 'Payment received',
					body: 'Isolation proof',
					deepLinkPath: '/billing',
					correlationId: 'channel-isolation',
					now: new Date()
				});
			});

			const rows = await db
				.select({ channel: notificationLog.channel, title: notificationLog.title })
				.from(notificationLog)
				.where(eq(notificationLog.correlationId, 'channel-isolation'));
			expect(rows.map((row) => row.channel).sort()).toEqual(['in_app']);
			expect(rows[0]?.title).toBe('Payment received');
		});
	}, 90_000);
});
