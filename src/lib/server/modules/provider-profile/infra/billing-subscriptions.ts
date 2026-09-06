import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { upsertSearchProjection } from '../../discovery-search';
import type { DomainEvent } from '../../../shared/events';
import type { ProviderProfileId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { unpublishProviderProfile } from './unpublish-profile';
import { providerProfiles } from './schema';

export async function handleBillingListingLapsed(
	tx: Transaction,
	event: DomainEvent<'ListingLapsed', { subscriptionId: string; providerProfileId: string }>,
	now: Date
): Promise<void> {
	const inserted = await markProcessed(tx, event.eventId, 'provider-profile.auto-unpublish');
	if (!inserted) return;

	await unpublishProviderProfile(
		tx,
		event.payload.providerProfileId as ProviderProfileId,
		'billing_lapse',
		event.correlationId,
		now
	);
}

export async function handleRepublishAfterBillingLapse(
	tx: Transaction,
	event: DomainEvent<
		'PaymentSucceeded',
		{ subscriptionId: string; invoiceId: string; amount: { cents: number; currency: string } }
	>,
	now: Date
): Promise<void> {
	const inserted = await markProcessed(tx, event.eventId, 'provider-profile.republish-after-lapse');
	if (!inserted) return;

	const profileId = event.payload.subscriptionId as ProviderProfileId;
	const rows = await tx
		.select({
			publishState: providerProfiles.publishState,
			unpublishReason: providerProfiles.unpublishReason,
			areaId: providerProfiles.areaId
		})
		.from(providerProfiles)
		.where(eq(providerProfiles.id, profileId))
		.limit(1);

	const profile = rows[0];
	if (!profile || profile.publishState === 'published') {
		return;
	}

	if (profile.unpublishReason !== 'billing_lapse') {
		return;
	}

	await tx
		.update(providerProfiles)
		.set({
			publishState: 'published',
			unpublishReason: null,
			updatedAt: now
		})
		.where(
			and(
				eq(providerProfiles.id, profileId),
				eq(providerProfiles.publishState, 'unpublished'),
				eq(providerProfiles.unpublishReason, 'billing_lapse')
			)
		);

	await upsertSearchProjection(tx, profileId, now);
}
