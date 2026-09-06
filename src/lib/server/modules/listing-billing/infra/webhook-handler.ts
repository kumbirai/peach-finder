import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { applyFailedPaymentTransition, applyListingBillingTransition } from './billing-transitions';
import { processedWebhooks } from './schema';
import type { PaystackWebhookEvent } from './webhook-signature';
import { processFeaturingPaymentFailed, processFeaturingPaymentWebhook } from './featuring-webhook';

export type WebhookProcessResult =
	| { status: 'duplicate' }
	| { status: 'ignored'; reason: string }
	| { status: 'processed'; providerProfileId: ProviderProfileId; transition: string };

export async function isWebhookProcessed(db: Database, pspEventId: string): Promise<boolean> {
	const rows = await db
		.select({ pspEventId: processedWebhooks.pspEventId })
		.from(processedWebhooks)
		.where(eq(processedWebhooks.pspEventId, pspEventId))
		.limit(1);
	return rows.length > 0;
}

function isFeaturingCharge(event: PaystackWebhookEvent): boolean {
	return event.data.metadata?.lineItem === 'featuring';
}

export async function processPaystackWebhook(
	db: Database,
	event: PaystackWebhookEvent,
	correlationId: string,
	now: Date
): Promise<WebhookProcessResult> {
	const already = await isWebhookProcessed(db, event.id);
	if (already) {
		return { status: 'duplicate' };
	}

	const providerProfileId = event.data.metadata?.providerProfileId;
	if (!providerProfileId) {
		return { status: 'ignored', reason: 'missing_provider_profile_id' };
	}

	const amountCents =
		event.data.amount !== undefined ? Math.round(event.data.amount / 100) : undefined;

	if (isFeaturingCharge(event)) {
		if (event.event === 'charge.success') {
			const activeFeaturing = await import('./featuring-read').then((m) =>
				m.getActiveFeaturing(db, providerProfileId as ProviderProfileId)
			);
			const featuringInput = {
				providerProfileId: providerProfileId as ProviderProfileId,
				reference: event.data.reference ?? null,
				eventId: event.id,
				correlationId,
				now,
				kind: activeFeaturing ? ('renewal' as const) : ('purchase' as const),
				...(amountCents !== undefined ? { amountCents } : {})
			};
			const result = await processFeaturingPaymentWebhook(db, featuringInput);

			if (result.status === 'duplicate') {
				return { status: 'duplicate' };
			}
			if (result.status === 'ignored') {
				return { status: 'ignored', reason: result.reason };
			}

			return {
				status: 'processed',
				providerProfileId: providerProfileId as ProviderProfileId,
				transition: result.kind === 'renewal' ? 'featuring_renewed' : 'featuring_activated'
			};
		}

		if (event.event === 'charge.failed' || event.event === 'invoice.payment_failed') {
			const failedInput = {
				providerProfileId: providerProfileId as ProviderProfileId,
				eventId: event.id,
				correlationId,
				now,
				reference: event.data.reference ?? null,
				...(amountCents !== undefined ? { amountCents } : {})
			};
			const result = await processFeaturingPaymentFailed(db, failedInput);

			if (result.status === 'duplicate') {
				return { status: 'duplicate' };
			}
			if (result.status === 'ignored') {
				return { status: 'ignored', reason: result.reason };
			}

			return {
				status: 'processed',
				providerProfileId: providerProfileId as ProviderProfileId,
				transition: 'featuring_lapsed'
			};
		}

		return { status: 'ignored', reason: 'unsupported_event' };
	}

	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(processedWebhooks)
			.values({ pspEventId: event.id, processedAt: now })
			.onConflictDoNothing()
			.returning({ pspEventId: processedWebhooks.pspEventId });

		if (inserted.length === 0) {
			return { status: 'duplicate' };
		}

		if (event.event === 'charge.success') {
			const result = await applyListingBillingTransition(tx, {
				providerProfileId: providerProfileId as ProviderProfileId,
				kind: 'payment_from_unpublished',
				now,
				correlationId,
				pspInvoiceRef: event.data.reference ?? null,
				...(amountCents !== undefined ? { amountCents } : {})
			});

			if (!result.applied) {
				await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, event.id));
				return {
					status: 'ignored',
					reason:
						result.previousState === 'missing' ? 'listing_not_found' : 'payment_not_applicable'
				};
			}

			return {
				status: 'processed',
				providerProfileId: providerProfileId as ProviderProfileId,
				transition: result.newState === 'paid_listed' ? 'payment_applied' : 'no_op'
			};
		}

		if (event.event === 'charge.failed' || event.event === 'invoice.payment_failed') {
			const result = await applyFailedPaymentTransition(tx, {
				providerProfileId: providerProfileId as ProviderProfileId,
				now,
				correlationId,
				pspInvoiceRef: event.data.reference ?? null,
				...(amountCents !== undefined ? { amountCents } : {})
			});

			if (!result.applied) {
				await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, event.id));
				return {
					status: 'ignored',
					reason:
						result.previousState === 'missing' ? 'listing_not_found' : 'failure_not_applicable'
				};
			}

			return {
				status: 'processed',
				providerProfileId: providerProfileId as ProviderProfileId,
				transition: 'paid_listed_to_grace'
			};
		}

		return { status: 'ignored', reason: 'unsupported_event' };
	});
}
