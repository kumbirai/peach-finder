import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { writeAudit } from '../../../shared/audit';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ProviderProfileId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import { publish } from '../../../shared/outbox';
import { getConfig } from '../../platform-configuration';
import type { FeaturingLapseReason } from '../domain/featuring-state';
import { paidPeriodEndsAt } from '../domain/subscription-state';
import { insertInvoice } from './invoice-read';
import { featuringAddons } from './schema';

export type FeaturingTransitionResult = {
	applied: boolean;
	providerProfileId: ProviderProfileId;
	events: DomainEvent[];
};

export async function activateFeaturing(
	tx: Transaction,
	input: {
		providerProfileId: ProviderProfileId;
		now: Date;
		correlationId: string;
		pspInvoiceRef: string | null;
		amountCents?: number;
	}
): Promise<FeaturingTransitionResult> {
	const existing = await tx
		.select({ id: featuringAddons.id })
		.from(featuringAddons)
		.where(
			and(
				eq(featuringAddons.providerProfileId, input.providerProfileId),
				eq(featuringAddons.state, 'active')
			)
		)
		.limit(1);

	if (existing.length > 0) {
		return { applied: false, providerProfileId: input.providerProfileId, events: [] };
	}

	const featuringPriceCents =
		input.amountCents ?? getConfig('listing-billing.featuring_price_cents');
	const periodEnd = paidPeriodEndsAt(input.now);
	const featuringId = newId();
	const invoiceId = newId<'InvoiceId'>();

	await insertInvoice(tx, {
		id: invoiceId,
		providerProfileId: input.providerProfileId,
		lineItem: 'featuring',
		amountCents: featuringPriceCents,
		status: 'paid',
		pspInvoiceRef: input.pspInvoiceRef,
		issuedAt: input.now,
		paidAt: input.now
	});

	await tx.insert(featuringAddons).values({
		id: featuringId,
		providerProfileId: input.providerProfileId,
		state: 'active',
		currentPeriodEndsAt: periodEnd,
		cancelAtPeriodEnd: false,
		createdAt: input.now,
		updatedAt: input.now
	});

	const event = buildFeaturingActivatedEvent(
		input.providerProfileId,
		input.correlationId,
		input.now
	);

	await writeAudit(tx, {
		actorId: null,
		actorRole: 'system',
		action: 'listing-billing.state_transition',
		targetType: 'featuring_addon',
		targetId: featuringId,
		metadata: {
			from: 'none',
			to: 'active',
			kind: 'featuring_purchase',
			invoiceId
		},
		correlationId: input.correlationId
	});

	await publish(tx, event);

	return {
		applied: true,
		providerProfileId: input.providerProfileId,
		events: [event]
	};
}

export async function renewFeaturing(
	tx: Transaction,
	input: {
		providerProfileId: ProviderProfileId;
		now: Date;
		correlationId: string;
		pspInvoiceRef: string | null;
		amountCents?: number;
	}
): Promise<FeaturingTransitionResult> {
	const locked = await tx
		.select()
		.from(featuringAddons)
		.where(
			and(
				eq(featuringAddons.providerProfileId, input.providerProfileId),
				eq(featuringAddons.state, 'active')
			)
		)
		.for('update');
	const row = locked[0];
	if (!row) {
		return { applied: false, providerProfileId: input.providerProfileId, events: [] };
	}

	const featuringPriceCents =
		input.amountCents ?? getConfig('listing-billing.featuring_price_cents');
	const invoiceId = newId<'InvoiceId'>();
	const periodEnd = paidPeriodEndsAt(input.now);

	await insertInvoice(tx, {
		id: invoiceId,
		providerProfileId: input.providerProfileId,
		lineItem: 'featuring',
		amountCents: featuringPriceCents,
		status: 'paid',
		pspInvoiceRef: input.pspInvoiceRef,
		issuedAt: input.now,
		paidAt: input.now
	});

	await tx
		.update(featuringAddons)
		.set({
			currentPeriodEndsAt: periodEnd,
			cancelAtPeriodEnd: false,
			updatedAt: input.now
		})
		.where(eq(featuringAddons.id, row.id));

	await writeAudit(tx, {
		actorId: null,
		actorRole: 'system',
		action: 'listing-billing.state_transition',
		targetType: 'featuring_addon',
		targetId: row.id,
		metadata: {
			from: 'active',
			to: 'active',
			kind: 'featuring_renewal',
			invoiceId
		},
		correlationId: input.correlationId
	});

	return {
		applied: true,
		providerProfileId: input.providerProfileId,
		events: []
	};
}

export async function forceLapseFeaturing(
	tx: Transaction,
	input: {
		providerProfileId: ProviderProfileId;
		now: Date;
		correlationId: string;
		reason: FeaturingLapseReason;
	}
): Promise<FeaturingTransitionResult> {
	const locked = await tx
		.select()
		.from(featuringAddons)
		.where(
			and(
				eq(featuringAddons.providerProfileId, input.providerProfileId),
				eq(featuringAddons.state, 'active')
			)
		)
		.for('update');
	const row = locked[0];
	if (!row) {
		return { applied: false, providerProfileId: input.providerProfileId, events: [] };
	}

	await tx
		.update(featuringAddons)
		.set({
			state: 'lapsed',
			currentPeriodEndsAt: null,
			cancelAtPeriodEnd: false,
			updatedAt: input.now
		})
		.where(eq(featuringAddons.id, row.id));

	const event = buildFeaturingLapsedEvent(
		input.providerProfileId,
		input.correlationId,
		input.now,
		input.reason
	);

	await writeAudit(tx, {
		actorId: null,
		actorRole: 'system',
		action: 'listing-billing.state_transition',
		targetType: 'featuring_addon',
		targetId: row.id,
		metadata: {
			from: 'active',
			to: 'lapsed',
			kind: 'featuring_lapsed',
			reason: input.reason
		},
		correlationId: input.correlationId
	});

	await publish(tx, event);

	return {
		applied: true,
		providerProfileId: input.providerProfileId,
		events: [event]
	};
}

function buildFeaturingActivatedEvent(
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date
): DomainEvent<'FeaturingActivated', { subscriptionId: string; providerProfileId: string }> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'FeaturingActivated',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			providerProfileId
		}
	};
}

function buildFeaturingLapsedEvent(
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date,
	reason: FeaturingLapseReason
): DomainEvent<
	'FeaturingLapsed',
	{ subscriptionId: string; providerProfileId: string; reason: FeaturingLapseReason }
> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'FeaturingLapsed',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			providerProfileId,
			reason
		}
	};
}
