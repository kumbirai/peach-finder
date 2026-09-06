import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { writeAudit } from '../../../shared/audit';
import type { DomainEvent } from '../../../shared/events';
import { newId, type InvoiceId, type ProviderProfileId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import { publish } from '../../../shared/outbox';
import { getConfig } from '../../platform-configuration';
import {
	emitsSubscriptionActivated,
	graceEndsAt,
	paidPeriodEndsAt,
	resolvePaymentTransition,
	type ListingTransition
} from '../domain/subscription-state';
import { forceLapseFeaturing } from './featuring-transitions';
import { insertInvoice } from './invoice-read';
import { listings } from './schema';

export type ListingRow = typeof listings.$inferSelect;

export type TransitionResult = {
	applied: boolean;
	providerProfileId: ProviderProfileId;
	previousState: string;
	newState: string;
	invoiceId: InvoiceId | null;
	events: DomainEvent[];
};

type TransitionInput = {
	providerProfileId: ProviderProfileId;
	kind:
		'free_listed_to_grace' | 'paid_listed_to_grace' | 'grace_to_unpublished' | ListingTransition;
	now: Date;
	correlationId: string;
	pspInvoiceRef?: string | null;
	amountCents?: number;
};

export async function applyListingBillingTransition(
	tx: Transaction,
	input: TransitionInput
): Promise<TransitionResult> {
	const lockedRows = await tx
		.select()
		.from(listings)
		.where(eq(listings.providerProfileId, input.providerProfileId))
		.for('update');
	const row = lockedRows[0];
	if (!row) {
		return {
			applied: false,
			providerProfileId: input.providerProfileId,
			previousState: 'missing',
			newState: 'missing',
			invoiceId: null,
			events: []
		};
	}

	const previousState = row.state;
	const gracePeriodDays = getConfig('listing-billing.grace_period_days');
	const listingPriceCents = getConfig('listing-billing.listing_price_cents');
	const events: DomainEvent[] = [];
	const invoiceId: InvoiceId | null = null;
	let newState: string;
	const updates: Partial<typeof listings.$inferInsert> = { updatedAt: input.now };

	switch (input.kind) {
		case 'free_listed_to_grace': {
			if (previousState !== 'free_listed') {
				return noOp(input.providerProfileId, previousState, events);
			}
			await forceLapseFeaturing(tx, {
				providerProfileId: input.providerProfileId,
				now: input.now,
				correlationId: input.correlationId,
				reason: 'listing_lapsed'
			});
			const endsAt = graceEndsAt(input.now, gracePeriodDays);
			newState = 'grace';
			updates.state = 'grace';
			updates.graceEndsAt = endsAt;
			updates.trialEndsAt = null;
			events.push(
				buildGraceEnteredEvent(input.providerProfileId, input.correlationId, input.now, endsAt)
			);
			break;
		}
		case 'paid_listed_to_grace': {
			if (previousState !== 'paid_listed') {
				return noOp(input.providerProfileId, previousState, events);
			}
			await forceLapseFeaturing(tx, {
				providerProfileId: input.providerProfileId,
				now: input.now,
				correlationId: input.correlationId,
				reason: 'listing_lapsed'
			});
			const endsAt = graceEndsAt(input.now, gracePeriodDays);
			newState = 'grace';
			updates.state = 'grace';
			updates.graceEndsAt = endsAt;
			updates.currentPeriodEndsAt = null;
			updates.cancelAtPeriodEnd = false;
			events.push(
				buildGraceEnteredEvent(input.providerProfileId, input.correlationId, input.now, endsAt)
			);
			break;
		}
		case 'grace_to_unpublished': {
			if (previousState !== 'grace') {
				return noOp(input.providerProfileId, previousState, events);
			}
			await forceLapseFeaturing(tx, {
				providerProfileId: input.providerProfileId,
				now: input.now,
				correlationId: input.correlationId,
				reason: 'listing_lapsed'
			});
			newState = 'unpublished';
			updates.state = 'unpublished';
			events.push(buildListingLapsedEvent(input.providerProfileId, input.correlationId, input.now));
			break;
		}
		case 'payment_from_free_listed':
		case 'payment_from_paid_listed':
		case 'payment_from_grace':
		case 'payment_from_unpublished': {
			const paymentKind = resolvePaymentTransition(previousState);
			if (!paymentKind) {
				return noOp(input.providerProfileId, previousState, events);
			}
			const paymentResult = await applyPaymentTransition(tx, {
				row,
				kind: paymentKind,
				now: input.now,
				correlationId: input.correlationId,
				pspInvoiceRef: input.pspInvoiceRef ?? null,
				amountCents: input.amountCents ?? listingPriceCents
			});
			if (!paymentResult.applied) {
				return noOp(input.providerProfileId, previousState, events);
			}
			return paymentResult;
		}
		default:
			return noOp(input.providerProfileId, previousState, events);
	}

	await tx
		.update(listings)
		.set(updates)
		.where(eq(listings.providerProfileId, input.providerProfileId));

	await writeAudit(tx, {
		actorId: null,
		actorRole: 'system',
		action: 'listing-billing.state_transition',
		targetType: 'subscription',
		targetId: input.providerProfileId,
		metadata: {
			from: previousState,
			to: newState,
			kind: input.kind
		},
		correlationId: input.correlationId
	});

	for (const event of events) {
		await publish(tx, event);
	}

	return {
		applied: true,
		providerProfileId: input.providerProfileId,
		previousState,
		newState,
		invoiceId,
		events
	};
}

async function applyPaymentTransition(
	tx: Transaction,
	input: {
		row: ListingRow;
		kind: ListingTransition;
		now: Date;
		correlationId: string;
		pspInvoiceRef: string | null;
		amountCents: number;
	}
): Promise<TransitionResult> {
	const previousState = input.row.state;
	const expected =
		input.kind === 'payment_from_free_listed'
			? 'free_listed'
			: input.kind === 'payment_from_paid_listed'
				? 'paid_listed'
				: input.kind === 'payment_from_grace'
					? 'grace'
					: 'unpublished';

	if (previousState !== expected) {
		return noOp(input.row.providerProfileId as ProviderProfileId, previousState, []);
	}

	const periodEnd = paidPeriodEndsAt(input.now);
	const invoiceId = newId<'InvoiceId'>();
	await insertInvoice(tx, {
		id: invoiceId,
		providerProfileId: input.row.providerProfileId as ProviderProfileId,
		lineItem: 'listing',
		amountCents: input.amountCents,
		status: 'paid',
		pspInvoiceRef: input.pspInvoiceRef,
		issuedAt: input.now,
		paidAt: input.now
	});

	const updates: Partial<typeof listings.$inferInsert> = {
		state: 'paid_listed',
		graceEndsAt: null,
		currentPeriodEndsAt: periodEnd,
		cancelAtPeriodEnd: false,
		updatedAt: input.now
	};

	if (input.kind === 'payment_from_free_listed') {
		updates.trialEndsAt = null;
	}

	await tx
		.update(listings)
		.set(updates)
		.where(eq(listings.providerProfileId, input.row.providerProfileId));

	const events: DomainEvent[] = [
		buildPaymentSucceededEvent(
			input.row.providerProfileId as ProviderProfileId,
			invoiceId,
			input.amountCents,
			input.correlationId,
			input.now
		)
	];

	if (emitsSubscriptionActivated(input.kind)) {
		events.push(
			buildSubscriptionActivatedEvent(
				input.row.providerProfileId as ProviderProfileId,
				input.correlationId,
				input.now
			)
		);
	}

	await writeAudit(tx, {
		actorId: null,
		actorRole: 'system',
		action: 'listing-billing.state_transition',
		targetType: 'subscription',
		targetId: input.row.providerProfileId,
		metadata: {
			from: previousState,
			to: 'paid_listed',
			kind: input.kind,
			invoiceId
		},
		correlationId: input.correlationId
	});

	for (const event of events) {
		await publish(tx, event);
	}

	return {
		applied: true,
		providerProfileId: input.row.providerProfileId as ProviderProfileId,
		previousState,
		newState: 'paid_listed',
		invoiceId,
		events
	};
}

export async function applyFailedPaymentTransition(
	tx: Transaction,
	input: {
		providerProfileId: ProviderProfileId;
		now: Date;
		correlationId: string;
		pspInvoiceRef?: string | null;
		amountCents?: number;
	}
): Promise<TransitionResult> {
	const listingPriceCents = getConfig('listing-billing.listing_price_cents');
	const lockedRows = await tx
		.select()
		.from(listings)
		.where(eq(listings.providerProfileId, input.providerProfileId))
		.for('update');
	const row = lockedRows[0];
	if (!row || row.state !== 'paid_listed') {
		return noOp(input.providerProfileId, row?.state ?? 'missing', []);
	}

	const invoiceId = newId<'InvoiceId'>();
	await insertInvoice(tx, {
		id: invoiceId,
		providerProfileId: input.providerProfileId,
		lineItem: 'listing',
		amountCents: input.amountCents ?? listingPriceCents,
		status: 'failed',
		pspInvoiceRef: input.pspInvoiceRef ?? null,
		issuedAt: input.now
	});

	const gracePeriodDays = getConfig('listing-billing.grace_period_days');
	const endsAt = graceEndsAt(input.now, gracePeriodDays);

	await tx
		.update(listings)
		.set({
			state: 'grace',
			graceEndsAt: endsAt,
			currentPeriodEndsAt: null,
			cancelAtPeriodEnd: false,
			updatedAt: input.now
		})
		.where(eq(listings.providerProfileId, input.providerProfileId));

	const events: DomainEvent[] = [
		buildPaymentFailedEvent(
			input.providerProfileId,
			invoiceId,
			input.amountCents ?? listingPriceCents,
			input.correlationId,
			input.now
		),
		buildGraceEnteredEvent(input.providerProfileId, input.correlationId, input.now, endsAt)
	];

	await writeAudit(tx, {
		actorId: null,
		actorRole: 'system',
		action: 'listing-billing.state_transition',
		targetType: 'subscription',
		targetId: input.providerProfileId,
		metadata: {
			from: 'paid_listed',
			to: 'grace',
			kind: 'paid_listed_to_grace',
			invoiceId
		},
		correlationId: input.correlationId
	});

	for (const event of events) {
		await publish(tx, event);
	}

	return {
		applied: true,
		providerProfileId: input.providerProfileId,
		previousState: 'paid_listed',
		newState: 'grace',
		invoiceId,
		events
	};
}

function noOp(
	providerProfileId: ProviderProfileId,
	state: string,
	events: DomainEvent[]
): TransitionResult {
	return {
		applied: false,
		providerProfileId,
		previousState: state,
		newState: state,
		invoiceId: null,
		events
	};
}

function buildGraceEnteredEvent(
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date,
	graceEnds: Date
): DomainEvent<'GraceEntered', { subscriptionId: string; graceEndsAt: string }> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'GraceEntered',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			graceEndsAt: graceEnds.toISOString()
		}
	};
}

function buildListingLapsedEvent(
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date
): DomainEvent<'ListingLapsed', { subscriptionId: string; providerProfileId: string }> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ListingLapsed',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			providerProfileId
		}
	};
}

function buildPaymentSucceededEvent(
	providerProfileId: ProviderProfileId,
	invoiceId: InvoiceId,
	amountCents: number,
	correlationId: string,
	now: Date
): DomainEvent<
	'PaymentSucceeded',
	{ subscriptionId: string; invoiceId: string; amount: { cents: number; currency: 'ZAR' } }
> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'PaymentSucceeded',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			invoiceId,
			amount: { cents: amountCents, currency: 'ZAR' }
		}
	};
}

function buildPaymentFailedEvent(
	providerProfileId: ProviderProfileId,
	invoiceId: InvoiceId,
	amountCents: number,
	correlationId: string,
	now: Date
): DomainEvent<
	'PaymentFailed',
	{ subscriptionId: string; invoiceId: string; amount: { cents: number; currency: 'ZAR' } }
> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'PaymentFailed',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			invoiceId,
			amount: { cents: amountCents, currency: 'ZAR' }
		}
	};
}

function buildSubscriptionActivatedEvent(
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date
): DomainEvent<'SubscriptionActivated', { subscriptionId: string; providerProfileId: string }> {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'SubscriptionActivated',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			subscriptionId: providerProfileId,
			providerProfileId
		}
	};
}
