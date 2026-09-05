import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import type { UserId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { mirrorNotifBlock, removeNotifBlock } from './block-cache';

export async function handleUserBlocked(
	db: Database,
	event: DomainEvent<'UserBlocked', { blockerId: string; blockedId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'user-notifications.block-silence');
		if (!inserted) return;
		await mirrorNotifBlock(
			tx,
			event.payload.blockerId as UserId,
			event.payload.blockedId as UserId,
			new Date(event.occurredAt)
		);
	});
}

export async function handleUserUnblocked(
	db: Database,
	event: DomainEvent<'UserUnblocked', { blockerId: string; blockedId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'user-notifications.unblock-cache');
		if (!inserted) return;
		await removeNotifBlock(
			tx,
			event.payload.blockerId as UserId,
			event.payload.blockedId as UserId
		);
	});
}
