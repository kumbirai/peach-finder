import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { applyFailedPaymentTransition, applyListingBillingTransition } from './billing-transitions';
import { processedWebhooks } from './schema';
import type { PaystackWebhookEvent } from './webhook-signature';

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
				...(event.data.amount !== undefined
					? { amountCents: Math.round(event.data.amount / 100) }
					: {})
			});

			if (!result.applied) {
				await tx
					.delete(processedWebhooks)
					.where(eq(processedWebhooks.pspEventId, event.id));
				return {
					status: 'ignored',
					reason: result.previousState === 'missing' ? 'listing_not_found' : 'payment_not_applicable'
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
				...(event.data.amount !== undefined
					? { amountCents: Math.round(event.data.amount / 100) }
					: {})
			});

			if (!result.applied) {
				await tx
					.delete(processedWebhooks)
					.where(eq(processedWebhooks.pspEventId, event.id));
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
