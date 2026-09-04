import type { Database } from '../../../db';
import { markProcessed } from '../../../shared/outbox';
import type { DomainEvent } from '../../../shared/events';
import { asId } from '../../../shared/ids';
import { releaseHeldMessagesForUser, markDeletedSenderAccountForUser } from './messaging-commands';

const RELEASE_SUBSCRIBER = 'direct-messaging.release-held';
const DELETION_SUBSCRIBER = 'direct-messaging.mark-deleted-account';

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
