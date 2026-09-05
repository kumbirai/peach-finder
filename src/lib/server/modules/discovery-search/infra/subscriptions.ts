import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { markProcessed } from '../../../shared/outbox';
import type { DomainEvent } from '../../../shared/events';
import { asId } from '../../../shared/ids';
import { blockedPair } from './schema';

const BLOCK_SUBSCRIBER = 'discovery-search.exclude-blocker';
const UNBLOCK_SUBSCRIBER = 'discovery-search.include-blocker';

export async function handleUserBlocked(
	db: Database,
	event: DomainEvent<'UserBlocked', { blockerId: string; blockedId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, BLOCK_SUBSCRIBER);
		if (!fresh) return;
		await tx
			.insert(blockedPair)
			.values({
				blockerId: asId<'UserId'>(event.payload.blockerId),
				blockedId: asId<'UserId'>(event.payload.blockedId)
			})
			.onConflictDoNothing();
	});
}

export async function handleUserUnblocked(
	db: Database,
	event: DomainEvent<'UserUnblocked', { blockerId: string; blockedId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, UNBLOCK_SUBSCRIBER);
		if (!fresh) return;
		await tx
			.delete(blockedPair)
			.where(
				and(
					eq(blockedPair.blockerId, asId<'UserId'>(event.payload.blockerId)),
					eq(blockedPair.blockedId, asId<'UserId'>(event.payload.blockedId))
				)
			);
	});
}
