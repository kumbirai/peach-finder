import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import { markProcessed } from '../../../shared/outbox';
import type { ProviderProfileId } from '../../../shared/ids';
import { captureContactRequest } from './capture';

export async function handleThreadCreatedForAnalytics(
	db: Database,
	event: DomainEvent<
		'ThreadCreated',
		{ threadId: string; seekerId: string; providerProfileId: string }
	>
): Promise<void> {
	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'provider-analytics.contact-request');
		if (!inserted) return;
		await captureContactRequest(
			tx as Database,
			event.payload.providerProfileId as ProviderProfileId,
			new Date(event.occurredAt)
		);
	});
}
