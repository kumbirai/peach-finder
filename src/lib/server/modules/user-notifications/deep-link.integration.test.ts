import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId, newId } from '../../shared/ids';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { sendOrHoldMessage } from '../direct-messaging';
import {
	handleMessageSent,
	handlePaymentFailed,
	handleVerificationDecided,
	listUnreadInAppNotifications
} from './index';
import { openInAppNotification } from './infra/in-app-open';
import { notificationLog } from './infra/schema';
import { users } from '../identity-and-access/infra/schema';

const PROVIDER_OWNER_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
const PRIMARY_PROFILE_ID = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

function messageSentEvent(
	payload: { threadId: string; messageId: string; senderId: string },
	correlationId: string
): DomainEvent<'MessageSent', typeof payload> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'MessageSent',
		version: 1,
		occurredAt: asInstant('2026-09-05T14:00:00Z'),
		correlationId,
		payload
	};
}

describe('US-NOTIF-04 deep-link integration', () => {
	it('TC-NOTIF-04a: new-message and billing notifications deep-link to thread and billing', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000d401');
			await db
				.insert(users)
				.values({
					id: seekerId,
					displayName: 'Deep Link Seeker',
					email: 'deeplink-seeker@example.com',
					emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
					status: 'active'
				})
				.onConflictDoNothing();

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: PRIMARY_PROFILE_ID,
				body: 'Deep link message',
				now: new Date('2026-09-05T14:00:00Z'),
				correlationId: 'corr-deeplink-msg'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('message send failed');

			await handleMessageSent(
				db,
				messageSentEvent(
					{
						threadId: sent.value.threadId,
						messageId: sent.value.messageId,
						senderId: seekerId
					},
					'corr-deeplink-msg'
				)
			);

			await handlePaymentFailed(
				db,
				{
					eventId: newId<'OutboxEventId'>(),
					eventName: 'PaymentFailed',
					version: 1,
					occurredAt: asInstant('2026-09-05T14:05:00Z'),
					correlationId: 'corr-deeplink-billing',
					payload: {
						subscriptionId: PRIMARY_PROFILE_ID,
						invoiceId: newId(),
						amount: 29900
					}
				}
			);

			const providerNotifications = await listUnreadInAppNotifications(db, PROVIDER_OWNER_ID, 20);
			const messageNotification = providerNotifications.find((row) => row.category === 'new_message');
			const billingNotification = providerNotifications.find(
				(row) => row.category === 'billing_payment'
			);

			expect(messageNotification?.deepLinkPath).toBe(`/messages/${sent.value.threadId}`);
			expect(messageNotification?.actionLabel).toBe('Open thread');
			expect(messageNotification?.openHref).toContain('/api/notifications/in-app/');
			expect(billingNotification?.deepLinkPath).toBe('/provider/billing');
			expect(billingNotification?.actionLabel).toBe('Manage billing');
		});
	});

	it('TC-NOTIF-04a: rejected verification deep-links to resubmission form', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await handleVerificationDecided(
				db,
				{
					eventId: newId<'OutboxEventId'>(),
					eventName: 'VerificationDecided',
					version: 1,
					occurredAt: asInstant('2026-09-05T14:00:00Z'),
					correlationId: 'corr-verify-reject',
					payload: {
						verificationCaseId: newId(),
						providerProfileId: PRIMARY_PROFILE_ID,
						decision: 'rejected'
					}
				}
			);

			const notifications = await listUnreadInAppNotifications(db, PROVIDER_OWNER_ID, 5);
			const verification = notifications.find((row) => row.category === 'identity_outcome');
			expect(verification?.deepLinkPath).toBe('/provider/verify');
			expect(verification?.actionLabel).toBe('Resubmit verification');
			expect(verification?.body).toMatch(/resubmission/i);
		});
	});

	it('openInAppNotification marks read and returns the stored deep link', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const notificationId = newId();
			const now = new Date('2026-09-05T15:00:00Z');
			await db.insert(notificationLog).values({
				id: notificationId,
				userId: PROVIDER_OWNER_ID,
				category: 'billing_payment',
				channel: 'in_app',
				status: 'sent',
				title: 'Payment failed',
				body: 'Update billing.',
				deepLinkPath: '/provider/billing',
				relatedEntityType: 'subscription',
				relatedEntityId: PRIMARY_PROFILE_ID,
				readAt: null,
				dispatchedAt: now,
				createdAt: now,
				correlationId: 'corr-open'
			});

			const opened = await openInAppNotification(db, PROVIDER_OWNER_ID, notificationId, now);
			expect(opened).toEqual({ ok: true, deepLinkPath: '/provider/billing' });

			const [row] = await db
				.select({ readAt: notificationLog.readAt })
				.from(notificationLog)
				.where(
					and(eq(notificationLog.id, notificationId), eq(notificationLog.userId, PROVIDER_OWNER_ID))
				);
			expect(row?.readAt).toEqual(now);
		});
	});
});
