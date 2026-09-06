import { and, eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { removeSearchProjection } from '../../discovery-search/index';
import { providerProfiles } from './schema';

export type UnpublishReason = 'owner' | 'admin' | 'billing_lapse';

export async function unpublishProviderProfile(
	tx: Transaction,
	profileId: ProviderProfileId,
	reason: UnpublishReason,
	correlationId: string,
	now: Date
): Promise<ProviderProfileId | null> {
	const lockedRows = await tx.execute<{
		id: string;
		publish_state: string;
	}>(sql`
		select id, publish_state
		from provider_profile.provider_profile
		where id = ${profileId}::uuid
		for update
		limit 1
	`);
	const row = (lockedRows as unknown as Array<{ id: string; publish_state: string }>)[0];
	if (!row) return null;

	return unpublishLockedProfile(tx, profileId, row.publish_state, reason, correlationId, now);
}

export async function unpublishProfileForOwner(
	tx: Transaction,
	ownerId: UserId,
	reason: UnpublishReason,
	correlationId: string,
	now: Date
): Promise<ProviderProfileId | null> {
	const lockedRows = await tx.execute<{
		id: string;
		publish_state: string;
	}>(sql`
		select id, publish_state
		from provider_profile.provider_profile
		where owner_id = ${ownerId}::uuid
		for update
		limit 1
	`);
	const row = (lockedRows as unknown as Array<{ id: string; publish_state: string }>)[0];
	if (!row) return null;

	const profileId = row.id as ProviderProfileId;
	return unpublishLockedProfile(tx, profileId, row.publish_state, reason, correlationId, now);
}

async function unpublishLockedProfile(
	tx: Transaction,
	profileId: ProviderProfileId,
	publishState: string,
	reason: UnpublishReason,
	correlationId: string,
	now: Date
): Promise<ProviderProfileId | null> {
	if (publishState !== 'published') {
		if (publishState === 'unpublished') {
			await removeSearchProjection(tx, profileId);
		}
		return profileId;
	}

	const updated = await tx
		.update(providerProfiles)
		.set({
			publishState: 'unpublished',
			unpublishReason: reason,
			updatedAt: now
		})
		.where(and(eq(providerProfiles.id, profileId), eq(providerProfiles.publishState, 'published')))
		.returning({ id: providerProfiles.id });

	if (updated.length === 0) {
		return profileId;
	}

	await removeSearchProjection(tx, profileId);

	const event: DomainEvent<
		'ProviderUnpublished',
		{ providerProfileId: string; reason: UnpublishReason }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ProviderUnpublished',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: { providerProfileId: profileId, reason }
	};
	await publish(tx, event);

	return profileId;
}

export async function unpublishProfileForOwnerDb(
	db: Database,
	ownerId: UserId,
	reason: UnpublishReason,
	correlationId: string,
	now: Date
): Promise<ProviderProfileId | null> {
	return db.transaction((tx) => unpublishProfileForOwner(tx, ownerId, reason, correlationId, now));
}
