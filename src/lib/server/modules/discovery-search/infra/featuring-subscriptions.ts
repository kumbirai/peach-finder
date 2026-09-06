import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import type { ProviderProfileId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { searchProjection } from './schema';

const FEATURING_SUBSCRIBER = 'discovery-search.featuring';

export async function handleFeaturingActivated(
	tx: Transaction,
	event: DomainEvent<'FeaturingActivated', { subscriptionId: string; providerProfileId: string }>,
	now: Date
): Promise<void> {
	const inserted = await markProcessed(tx, event.eventId, FEATURING_SUBSCRIBER);
	if (!inserted) return;

	await tx
		.update(searchProjection)
		.set({
			isFeatured: true,
			featuredSince: now,
			updatedAt: now
		})
		.where(eq(searchProjection.providerProfileId, event.payload.providerProfileId as ProviderProfileId));
}

export async function handleFeaturingLapsed(
	tx: Transaction,
	event: DomainEvent<
		'FeaturingLapsed',
		{ subscriptionId: string; providerProfileId: string; reason: string }
	>,
	now: Date
): Promise<void> {
	const inserted = await markProcessed(tx, event.eventId, FEATURING_SUBSCRIBER);
	if (!inserted) return;

	await tx
		.update(searchProjection)
		.set({
			isFeatured: false,
			featuredSince: null,
			updatedAt: now
		})
		.where(eq(searchProjection.providerProfileId, event.payload.providerProfileId as ProviderProfileId));
}
