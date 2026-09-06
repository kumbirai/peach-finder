import { and, eq, lte } from 'drizzle-orm';
import type { Database } from '../../../db';
import { getConfig } from '../../platform-configuration';
import {
	areMessagesStillUnreadByRecipient,
	getThreadIdForMessage,
	resolveThreadAccess
} from '../../direct-messaging';
import { getDisplayIdentity } from '../../identity-and-access';
import type { DomainEvent } from '../../../shared/events';
import { newId, type MessageId, type ThreadId, type UserId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { isNotifBlockedBetween } from './block-cache';
import { allOptOutChannelsDisabled, isChannelEnabled } from './preference-commands';
import { notificationBatchWindow, notificationLog } from './schema';

type MessageSentPayload = {
	threadId: string;
	messageId: string;
	senderId: string;
};

async function resolveRecipient(
	db: Database,
	threadId: ThreadId,
	senderId: UserId
): Promise<UserId | null> {
	const access = await resolveThreadAccess(db, threadId, senderId);
	if (!access.ok) return null;
	return access.value.counterpartUserId;
}

async function senderDisplayName(db: Database, senderId: UserId): Promise<string> {
	const identity = await getDisplayIdentity(db, senderId);
	return identity.isDeleted ? 'Someone' : identity.displayName;
}

export async function handleMessageSent(
	db: Database,
	event: DomainEvent<'MessageSent', MessageSentPayload>
): Promise<void> {
	const { threadId, messageId, senderId } = event.payload;
	const recipientId = await resolveRecipient(db, threadId as ThreadId, senderId as UserId);
	if (!recipientId) return;

	if (await isNotifBlockedBetween(db, senderId as UserId, recipientId)) {
		return;
	}

	if (await allOptOutChannelsDisabled(db, recipientId, 'new_message')) {
		return;
	}

	const now = new Date(event.occurredAt);
	const batchMinutes = getConfig('user-notifications.batch_window_minutes');
	const flushAfter = new Date(now.getTime() + batchMinutes * 60_000);
	const senderName = await senderDisplayName(db, senderId as UserId);
	const deepLinkPath = `/messages/${threadId}`;

	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'user-notifications.new-message');
		if (!inserted) return;

		const windowKey = and(
			eq(notificationBatchWindow.userId, recipientId),
			eq(notificationBatchWindow.category, 'new_message'),
			eq(notificationBatchWindow.sourceKey, senderId)
		);
		const [window] = await tx.select().from(notificationBatchWindow).where(windowKey).limit(1);

		if (window?.status === 'open') {
			if (now > window.flushAfter) {
				await tx.update(notificationBatchWindow).set({ status: 'flushed' }).where(windowKey);
			} else {
				if (now < window.openedAt) {
					const backlogGapMs = window.openedAt.getTime() - now.getTime();
					if (backlogGapMs > batchMinutes * 60_000) {
						return;
					}
				}
				await tx
					.update(notificationBatchWindow)
					.set({
						messageCount: window.messageCount + 1,
						lastMessageId: messageId,
						openedAt: now < window.openedAt ? now : window.openedAt
					})
					.where(windowKey);
				return;
			}
		} else if (window?.status === 'flushed' && now <= window.flushAfter) {
			return;
		}

		const inAppId = newId();
		const inAppEnabled = await isChannelEnabled(tx, recipientId, 'new_message', 'in_app');
		if (inAppEnabled) {
			await tx.insert(notificationLog).values({
				id: inAppId,
				userId: recipientId,
				category: 'new_message',
				channel: 'in_app',
				status: 'sent',
				title: `New message from ${senderName}`,
				body: 'Tap to read and reply.',
				deepLinkPath,
				relatedEntityType: 'thread',
				relatedEntityId: threadId,
				readAt: null,
				dispatchedAt: now,
				createdAt: now,
				correlationId: event.correlationId
			});
		}

		const windowValues = {
			openedAt: now,
			flushAfter,
			messageCount: 1,
			lastMessageId: messageId,
			inAppNotificationId: inAppEnabled ? inAppId : null,
			status: 'open' as const
		};

		if (window) {
			await tx.update(notificationBatchWindow).set(windowValues).where(windowKey);
			return;
		}

		await tx.insert(notificationBatchWindow).values({
			userId: recipientId,
			category: 'new_message',
			sourceKey: senderId,
			...windowValues
		});
	});
}

export async function flushDueNotificationBatchWindows(db: Database, now: Date): Promise<number> {
	const due = await db
		.select()
		.from(notificationBatchWindow)
		.where(
			and(eq(notificationBatchWindow.status, 'open'), lte(notificationBatchWindow.flushAfter, now))
		);

	let flushed = 0;
	for (const window of due) {
		await db.transaction(async (tx) => {
			const senderName = await senderDisplayName(tx, window.sourceKey as UserId);
			const count = window.messageCount;
			const threadPath = window.lastMessageId
				? await threadPathForMessage(tx, window.lastMessageId as MessageId)
				: '/messages';

			if (count >= 2 && window.inAppNotificationId) {
				const title = `${count} new messages from ${senderName}`;
				await tx
					.update(notificationLog)
					.set({ title, body: 'Tap to read and reply.' })
					.where(eq(notificationLog.id, window.inAppNotificationId));
			}

			const emailEnabled = await isChannelEnabled(
				tx,
				window.userId as UserId,
				'new_message',
				'email'
			);
			const stillUnread =
				emailEnabled &&
				window.lastMessageId &&
				(await areMessagesStillUnreadByRecipient(
					tx,
					window.userId as UserId,
					window.lastMessageId as MessageId
				));

			if (stillUnread) {
				const emailId = newId();
				await tx.insert(notificationLog).values({
					id: emailId,
					userId: window.userId,
					category: 'new_message',
					channel: 'email',
					status: 'sent',
					title:
						count === 1
							? `New message from ${senderName}`
							: `You have ${count} new messages from ${senderName}`,
					body: 'Open Peach Finder to read and reply.',
					deepLinkPath: threadPath,
					relatedEntityType: 'thread',
					relatedEntityId: null,
					readAt: null,
					dispatchedAt: now,
					createdAt: now,
					correlationId: `batch-flush-${window.userId}-${window.sourceKey}`
				});
			}

			await tx
				.update(notificationBatchWindow)
				.set({ status: 'flushed' })
				.where(
					and(
						eq(notificationBatchWindow.userId, window.userId),
						eq(notificationBatchWindow.category, window.category),
						eq(notificationBatchWindow.sourceKey, window.sourceKey)
					)
				);
		});
		flushed += 1;
	}
	return flushed;
}

/** Dev/test helper: make all open batch windows due, then flush. */
export async function forceFlushOpenNotificationBatchWindows(
	db: Database,
	now: Date
): Promise<number> {
	await db
		.update(notificationBatchWindow)
		.set({ flushAfter: now })
		.where(eq(notificationBatchWindow.status, 'open'));
	return flushDueNotificationBatchWindows(db, now);
}

async function threadPathForMessage(db: Database, messageId: MessageId): Promise<string> {
	const threadId = await getThreadIdForMessage(db, messageId);
	return threadId ? `/messages/${threadId}` : '/messages';
}
