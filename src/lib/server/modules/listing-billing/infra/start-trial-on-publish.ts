import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { getConfig } from '../../platform-configuration';
import { newId, type ProviderProfileId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { listings } from './schema';

export async function startTrialOnPublish(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date
): Promise<void> {
	const rows = await tx
		.select({
			state: listings.state,
			trialStartedAt: listings.trialStartedAt
		})
		.from(listings)
		.where(eq(listings.providerProfileId, providerProfileId))
		.limit(1);

	const row = rows[0];
	if (!row) {
		const trialEndsAt = trialEndsAtFrom(now);
		await tx.insert(listings).values({
			providerProfileId,
			state: 'free_listed',
			trialStartedAt: now,
			trialEndsAt,
			updatedAt: now
		});
		await emitTrialStarted(tx, providerProfileId, correlationId, now, trialEndsAt);
		return;
	}

	if (row.trialStartedAt != null || row.state !== 'building') {
		return;
	}

	const trialEndsAt = trialEndsAtFrom(now);
	await tx
		.update(listings)
		.set({
			state: 'free_listed',
			trialStartedAt: now,
			trialEndsAt,
			updatedAt: now
		})
		.where(eq(listings.providerProfileId, providerProfileId));

	await emitTrialStarted(tx, providerProfileId, correlationId, now, trialEndsAt);
}

function trialEndsAtFrom(now: Date): Date {
	const trialDays = getConfig('listing-billing.trial_period_days');
	const ends = new Date(now);
	ends.setUTCDate(ends.getUTCDate() + trialDays);
	return ends;
}

async function emitTrialStarted(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date,
	trialEndsAt: Date
): Promise<void> {
	const event: DomainEvent<
		'TrialStarted',
		{ providerProfileId: string; subscriptionId: string; trialEndsAt: string }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'TrialStarted',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			subscriptionId: providerProfileId,
			trialEndsAt: trialEndsAt.toISOString()
		}
	};
	await publish(tx, event);
}
