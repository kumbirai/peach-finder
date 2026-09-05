import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { sendOrHoldMessage, sendMessageInThread } from '../direct-messaging';
import { handleMessageSent, flushDueNotificationBatchWindows } from './index';
import { mirrorNotifBlock } from './infra/block-cache';
import { notificationBatchWindow, notificationLog } from './infra/schema';
import { users } from '../identity-and-access/infra/schema';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { newId } from '../../shared/ids';

async function seedSeeker(
	db: import('../../db').Database,
	id: string,
	name: string
): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			displayName: name,
			email: `${id}@example.com`,
			emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
			status: 'active'
		})
		.onConflictDoNothing();
}

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

describe('US-MSG-04 message notifications integration', () => {
	it('TC-NOTIF-03a: burst messages collapse to one in-app notification per sender', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a402');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Burst Seeker');
			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

			const first = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: profileId,
				body: 'Message 1',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-burst-1'
			});
			if (!first.ok || first.value.kind !== 'sent') throw new Error('first send failed');

			await handleMessageSent(
				db,
				messageSentEvent(
					{
						threadId: first.value.threadId,
						messageId: first.value.messageId,
						senderId: seekerId
					},
					'2026-09-05T12:00:00Z'
				) as never
			);

			for (let i = 2; i <= 6; i++) {
				const sent = await sendMessageInThread(db, {
					threadId: first.value.threadId,
					senderId: seekerId,
					body: `Message ${i}`,
					now: new Date(`2026-09-05T12:0${i}:00Z`),
					correlationId: `corr-burst-${i}`
				});
				if (!sent.ok) throw new Error('burst send failed');
				await handleMessageSent(
					db,
					messageSentEvent(
						{
							threadId: first.value.threadId,
							messageId: sent.value.messageId,
							senderId: seekerId
						},
						`2026-09-05T12:0${i}:00Z`
					) as never
				);
			}

			const inAppRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.userId, providerOwnerId));
			expect(inAppRows.filter((r) => r.channel === 'in_app')).toHaveLength(1);

			const window = await db
				.select()
				.from(notificationBatchWindow)
				.where(eq(notificationBatchWindow.userId, providerOwnerId));
			expect(window[0]?.messageCount).toBe(6);
			expect(window[0]?.status).toBe('open');
		});
	});

	it('TC-NOTIF-03b: block silence produces zero notifications', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a403');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Blocked Seeker');
			await mirrorNotifBlock(db, providerOwnerId, seekerId, new Date());

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				body: 'Should not notify',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-blocked'
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
					'2026-09-05T12:00:00Z'
				) as never
			);

			const rows = await db.select().from(notificationLog);
			expect(rows).toHaveLength(0);
		});
	});

	it('ignores duplicate MessageSent delivery for the same event id', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a405');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Idempotent Seeker');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				body: 'Idempotency probe',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-idempotent'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const event = messageSentEvent(
				{
					threadId: sent.value.threadId,
					messageId: sent.value.messageId,
					senderId: seekerId
				},
				'2026-09-05T12:00:00Z'
			);

			await handleMessageSent(db, event as never);
			await handleMessageSent(db, event as never);

			const inAppRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.userId, providerOwnerId));
			expect(inAppRows.filter((r) => r.channel === 'in_app')).toHaveLength(1);

			const windows = await db
				.select()
				.from(notificationBatchWindow)
				.where(eq(notificationBatchWindow.userId, providerOwnerId));
			expect(windows).toHaveLength(1);
			expect(windows[0]?.messageCount).toBe(1);
		});
	});

	it('suppresses email when messages were read before batch flush', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a404');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Read Seeker');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId: asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				body: 'Read before flush',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-read-flush'
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
					'2026-09-05T12:00:00Z'
				) as never
			);

			const { markThreadReadUpTo } = await import('../direct-messaging');
			await markThreadReadUpTo(
				db,
				sent.value.threadId,
				providerOwnerId,
				sent.value.messageId,
				new Date('2026-09-05T12:01:00Z')
			);

			await db
				.update(notificationBatchWindow)
				.set({ flushAfter: new Date('2026-09-05T12:00:00Z') })
				.where(eq(notificationBatchWindow.userId, providerOwnerId));

			await flushDueNotificationBatchWindows(db, new Date('2026-09-05T12:10:00Z'));

			const emailRows = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.channel, 'email'));
			expect(emailRows).toHaveLength(0);
		});
	});
});
