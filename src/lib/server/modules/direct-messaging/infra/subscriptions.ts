import type { Database } from '../../../db';
import { markProcessed } from '../../../shared/outbox';
import type { DomainEvent } from '../../../shared/events';
import { asId } from '../../../shared/ids';
import { releaseHeldMessagesForUser } from './messaging-commands';

const SUBSCRIBER = 'direct-messaging.release-held';

export async function handleEmailVerified(
	db: Database,
	event: DomainEvent<'EmailVerified', { userId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const fresh = await markProcessed(tx, event.eventId, SUBSCRIBER);
		if (!fresh) return;
		await releaseHeldMessagesForUser(
			tx,
			asId<'UserId'>(event.payload.userId),
			new Date(event.occurredAt),
			event.correlationId
		);
	});
}
