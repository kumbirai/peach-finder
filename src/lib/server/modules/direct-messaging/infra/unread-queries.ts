import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { MessageId, ThreadId, UserId } from '../../../shared/ids';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { messages, threads } from './schema';

export async function countUnreadInThread(
	db: Database,
	threadId: ThreadId,
	viewerId: UserId
): Promise<number> {
	const rows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(messages)
		.where(
			and(eq(messages.threadId, threadId), ne(messages.senderId, viewerId), isNull(messages.readAt))
		);
	return rows[0]?.count ?? 0;
}

export async function countTotalUnreadForSeeker(db: Database, seekerId: UserId): Promise<number> {
	const rows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(
			and(eq(threads.seekerId, seekerId), ne(messages.senderId, seekerId), isNull(messages.readAt))
		);
	return rows[0]?.count ?? 0;
}

export async function countTotalUnreadForProviderOwner(
	db: Database,
	ownerId: UserId
): Promise<number> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) return 0;

	const rows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(
			and(
				eq(threads.providerProfileId, profileId),
				ne(messages.senderId, ownerId),
				isNull(messages.readAt)
			)
		);
	return rows[0]?.count ?? 0;
}

export async function getThreadIdForMessage(
	db: Database,
	messageId: MessageId
): Promise<ThreadId | null> {
	const rows = await db
		.select({ threadId: messages.threadId })
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);
	return (rows[0]?.threadId as ThreadId) ?? null;
}

export async function areMessagesStillUnreadByRecipient(
	db: Database,
	recipientId: UserId,
	upToMessageId: MessageId
): Promise<boolean> {
	const rows = await db
		.select({ id: messages.id })
		.from(messages)
		.where(
			and(
				eq(messages.id, upToMessageId),
				ne(messages.senderId, recipientId),
				isNull(messages.readAt)
			)
		)
		.limit(1);
	return rows.length > 0;
}
