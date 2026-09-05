import type { Database } from '../../../db';
import { markProcessed } from '../../../shared/outbox';
import type { DomainEvent } from '../../../shared/events';
import { asId } from '../../../shared/ids';
import { releaseHeldMessagesForUser, markDeletedSenderAccountForUser } from './messaging-commands';
import { mirrorBlock, removeBlockMirror } from './block-cache';

const RELEASE_SUBSCRIBER = 'direct-messaging.release-held';
const DELETION_SUBSCRIBER = 'direct-messaging.mark-deleted-account';
const BLOCK_SUBSCRIBER = 'direct-messaging.block-cache';
const UNBLOCK_SUBSCRIBER = 'direct-messaging.unblock-cache';

export async function handleEmailVerified(
	db: Database,
	event: DomainEvent<'EmailVerified', { userId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, RELEASE_SUBSCRIBER);
		if (!fresh) return;
		await releaseHeldMessagesForUser(
			tx,
			asId<'UserId'>(event.payload.userId),
			new Date(event.occurredAt),
			event.correlationId
		);
	});
}

export async function handleAccountDeletionRequested(
	db: Database,
	event: DomainEvent<'AccountDeletionRequested', { userId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, DELETION_SUBSCRIBER);
		if (!fresh) return;
		await markDeletedSenderAccountForUser(tx, asId<'UserId'>(event.payload.userId));
	});
}

export async function handleUserBlocked(
	db: Database,
	event: DomainEvent<'UserBlocked', { blockerId: string; blockedId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, BLOCK_SUBSCRIBER);
		if (!fresh) return;
		await mirrorBlock(
			tx,
			asId<'UserId'>(event.payload.blockerId),
			asId<'UserId'>(event.payload.blockedId),
			new Date(event.occurredAt)
		);
	});
}

export async function handleUserUnblocked(
	db: Database,
	event: DomainEvent<'UserUnblocked', { blockerId: string; blockedId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, UNBLOCK_SUBSCRIBER);
		if (!fresh) return;
		await removeBlockMirror(
			tx,
			asId<'UserId'>(event.payload.blockerId),
			asId<'UserId'>(event.payload.blockedId)
		);
	});
}
