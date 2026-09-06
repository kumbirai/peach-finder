import type { Transaction } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import type { ProviderProfileId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { removeSearchProjection } from './projection-commands';

export async function handleListingLapsedProjectionRemove(
	tx: Transaction,
	event: DomainEvent<'ListingLapsed', { subscriptionId: string; providerProfileId: string }>
): Promise<void> {
	const inserted = await markProcessed(tx, event.eventId, 'discovery-search.projection-remove');
	if (!inserted) return;
	await removeSearchProjection(tx, event.payload.providerProfileId as ProviderProfileId);
}
