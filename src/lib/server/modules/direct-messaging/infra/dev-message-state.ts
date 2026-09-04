import { and, count, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { messages, pendingMessages, threads } from './schema';

export async function getDevMessageState(
	db: Database,
	seekerId: UserId,
	providerProfileId: string
): Promise<{ messageCount: number; pendingCount: number }> {
	const pending = await db
		.select({ id: pendingMessages.id })
		.from(pendingMessages)
		.where(
			and(
				eq(pendingMessages.seekerId, seekerId),
				eq(pendingMessages.providerProfileId, providerProfileId),
				isNull(pendingMessages.releasedAt)
			)
		);

	const [messageCountRow] = await db
		.select({ count: count() })
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(and(eq(threads.seekerId, seekerId), eq(threads.providerProfileId, providerProfileId)));

	return {
		messageCount: messageCountRow?.count ?? 0,
		pendingCount: pending.length
	};
}
