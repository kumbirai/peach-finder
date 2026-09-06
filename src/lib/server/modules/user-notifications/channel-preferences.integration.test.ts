import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId, newId } from '../../shared/ids';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { sendOrHoldMessage } from '../direct-messaging';
import { users } from '../identity-and-access/infra/schema';
import {
	handleMessageSent,
	flushDueNotificationBatchWindows,
	handlePaymentFailed,
	updateNotificationPreferences
} from './index';
import { notificationLog } from './infra/schema';

const PROVIDER_OWNER_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
const PRIMARY_PROFILE_ID = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

function messageSentEvent(
	payload: { threadId: string; messageId: string; senderId: string },
	occurredAt: string
): DomainEvent<'MessageSent', typeof payload> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'MessageSent',
		version: 1,
		occurredAt: asInstant(occurredAt),
		correlationId: `corr-${payload.messageId}`,
		payload
	};
}

async function channelsForCategory(
	db: import('../../db').Database,
	userId: string,
	category: string
): Promise<string[]> {
	const rows = await db
		.select({ channel: notificationLog.channel })
		.from(notificationLog)
		.where(and(eq(notificationLog.userId, userId), eq(notificationLog.category, category)));
	return rows.map((row) => row.channel).sort();
}

describe('US-NOTIF-02 channel preferences integration', () => {
	it('TC-NOTIF-02a: disabling new-message in-app does not block email on flush', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000c601');
			await db
				.insert(users)
				.values({
					id: seekerId,
					displayName: 'Pref Seeker',
					email: 'pref-seeker@example.com',
					emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
					status: 'active'
				})
				.onConflictDoNothing();

			const disabled = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [
				{ category: 'new_message', channel: 'in_app', enabled: false },
				{ category: 'new_message', channel: 'push', enabled: false }
			]);
			expect(disabled.ok).toBe(true);

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: PRIMARY_PROFILE_ID,
				body: 'Preference probe',
				now: new Date('2026-09-05T16:00:00Z'),
				correlationId: 'corr-pref-1'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			await handleMessageSent(
				db,
				messageSentEvent(
					{
						threadId: sent.value.threadId,
						messageId: sent.value.messageId,
						senderId: seekerId
					},
					'2026-09-05T16:00:00Z'
				) as never
			);

			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'new_message')).toEqual([]);

			await flushDueNotificationBatchWindows(db, new Date('2026-09-05T16:06:00Z'));
			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'new_message')).toEqual(['email']);
		});
	});

	it('TC-NOTIF-02b: essential billing notices ignore disabled non-essential channels', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const disabled = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [
				{ category: 'new_message', channel: 'email', enabled: false },
				{ category: 'new_message', channel: 'in_app', enabled: false },
				{ category: 'new_message', channel: 'push', enabled: false },
				{ category: 'review_received', channel: 'email', enabled: false },
				{ category: 'review_received', channel: 'in_app', enabled: false },
				{ category: 'availability_expiry_warning', channel: 'in_app', enabled: false },
				{ category: 'availability_expiry_warning', channel: 'push', enabled: false }
			]);
			expect(disabled.ok).toBe(true);

			await handlePaymentFailed(db, {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'PaymentFailed',
				version: 1,
				occurredAt: asInstant('2026-09-05T16:10:00Z'),
				correlationId: 'corr-billing-pref',
				payload: {
					subscriptionId: PRIMARY_PROFILE_ID,
					invoiceId: newId(),
					amount: 29900
				}
			} as never);

			expect(await channelsForCategory(db, PROVIDER_OWNER_ID, 'billing_payment')).toEqual([
				'email',
				'in_app'
			]);
		});
	});

	it('rejects attempts to toggle essential categories', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const result = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [
				{ category: 'billing_payment', channel: 'email', enabled: false }
			]);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error('expected validation failure');
			expect(result.error.kind).toBe('validation_failed');
		});
	});

	it('rejects unknown categories and unavailable channels', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const unknownCategory = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [
				{ category: 'not_a_real_category', channel: 'email', enabled: false }
			]);
			expect(unknownCategory.ok).toBe(false);

			const wrongChannel = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [
				{ category: 'report_resolution', channel: 'email', enabled: false }
			]);
			expect(wrongChannel.ok).toBe(false);
		});
	});

	it('idempotently applies the same opt-out twice', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const update = { category: 'new_message', channel: 'push', enabled: false as const };
			const first = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [update]);
			const second = await updateNotificationPreferences(db, PROVIDER_OWNER_ID, [update]);
			expect(first.ok).toBe(true);
			expect(second.ok).toBe(true);
			if (!first.ok || !second.ok) throw new Error('expected successful updates');

			const push = first.value.categories
				.find((category) => category.id === 'new_message')
				?.channels.find((channel) => channel.id === 'push');
			expect(push?.enabled).toBe(false);
			expect(second.value).toEqual(first.value);
		});
	});
});
