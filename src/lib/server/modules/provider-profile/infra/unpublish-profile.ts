import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { removeSearchProjection } from '../../discovery-search/index';
import { providerProfiles } from './schema';

export async function unpublishProfileForOwner(
	tx: Transaction,
	ownerId: UserId,
	reason: string,
	correlationId: string,
	now: Date
): Promise<ProviderProfileId | null> {
	const rows = await tx
		.select({ id: providerProfiles.id, publishState: providerProfiles.publishState })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, ownerId))
		.limit(1);

	const row = rows[0];
	if (!row || row.publishState !== 'published') {
		if (row) {
			await removeSearchProjection(tx, row.id as ProviderProfileId);
		}
		return row ? (row.id as ProviderProfileId) : null;
	}

	const profileId = row.id as ProviderProfileId;

	await tx
		.update(providerProfiles)
		.set({
			publishState: 'unpublished',
			unpublishReason: reason,
			updatedAt: now
		})
		.where(eq(providerProfiles.id, profileId));

	await removeSearchProjection(tx, profileId);

	const event: DomainEvent<'ProviderUnpublished', { providerProfileId: string }> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ProviderUnpublished',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: { providerProfileId: profileId }
	};
	await publish(tx, event);

	return profileId;
}
