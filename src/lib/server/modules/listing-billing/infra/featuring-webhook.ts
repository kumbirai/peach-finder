import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { getConfig } from '../../platform-configuration';
import { getActiveFeaturing } from './featuring-read';
import { activateFeaturing, forceLapseFeaturing, renewFeaturing } from './featuring-transitions';
import { processedWebhooks } from './schema';

export type FeaturingWebhookResult =
	| { status: 'duplicate' }
	| { status: 'ignored'; reason: string }
	| { status: 'processed'; kind: 'purchase' | 'renewal' };

export async function processFeaturingPaymentWebhook(
	db: Database,
	input: {
		providerProfileId: ProviderProfileId;
		reference: string | null;
		eventId: string;
		correlationId: string;
		now: Date;
		kind: 'purchase' | 'renewal';
		amountCents?: number;
	}
): Promise<FeaturingWebhookResult> {
	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(processedWebhooks)
			.values({ pspEventId: input.eventId, processedAt: input.now })
			.onConflictDoNothing()
			.returning({ pspEventId: processedWebhooks.pspEventId });

		if (inserted.length === 0) {
			return { status: 'duplicate' };
		}

		const activeFeaturing = await getActiveFeaturing(tx, input.providerProfileId);
		const featuringPriceCents =
			input.amountCents ?? getConfig('listing-billing.featuring_price_cents');

		if (input.kind === 'purchase') {
			if (activeFeaturing) {
				await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, input.eventId));
				return { status: 'ignored', reason: 'featuring_already_active' };
			}

			const activated = await activateFeaturing(tx, {
				providerProfileId: input.providerProfileId,
				now: input.now,
				correlationId: input.correlationId,
				pspInvoiceRef: input.reference,
				amountCents: featuringPriceCents
			});

			if (!activated.applied) {
				await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, input.eventId));
				return { status: 'ignored', reason: 'featuring_not_applicable' };
			}

			return { status: 'processed', kind: 'purchase' };
		}

		if (!activeFeaturing) {
			await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, input.eventId));
			return { status: 'ignored', reason: 'featuring_not_active' };
		}

		const renewed = await renewFeaturing(tx, {
			providerProfileId: input.providerProfileId,
			now: input.now,
			correlationId: input.correlationId,
			pspInvoiceRef: input.reference,
			amountCents: featuringPriceCents
		});

		if (!renewed.applied) {
			await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, input.eventId));
			return { status: 'ignored', reason: 'featuring_renewal_not_applicable' };
		}

		return { status: 'processed', kind: 'renewal' };
	});
}

export async function processFeaturingPaymentFailed(
	db: Database,
	input: {
		providerProfileId: ProviderProfileId;
		eventId: string;
		correlationId: string;
		now: Date;
		reference: string | null;
		amountCents?: number;
	}
): Promise<FeaturingWebhookResult> {
	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(processedWebhooks)
			.values({ pspEventId: input.eventId, processedAt: input.now })
			.onConflictDoNothing()
			.returning({ pspEventId: processedWebhooks.pspEventId });

		if (inserted.length === 0) {
			return { status: 'duplicate' };
		}

		const activeFeaturing = await getActiveFeaturing(tx, input.providerProfileId);
		if (!activeFeaturing) {
			await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, input.eventId));
			return { status: 'ignored', reason: 'featuring_not_active' };
		}

		const featuringPriceCents =
			input.amountCents ?? getConfig('listing-billing.featuring_price_cents');
		const { insertInvoice } = await import('./invoice-read');
		const { newId } = await import('../../../shared/ids');

		await insertInvoice(tx, {
			id: newId(),
			providerProfileId: input.providerProfileId,
			lineItem: 'featuring',
			amountCents: featuringPriceCents,
			status: 'failed',
			pspInvoiceRef: input.reference,
			issuedAt: input.now
		});

		const lapsed = await forceLapseFeaturing(tx, {
			providerProfileId: input.providerProfileId,
			now: input.now,
			correlationId: input.correlationId,
			reason: 'payment_failed'
		});

		if (!lapsed.applied) {
			await tx.delete(processedWebhooks).where(eq(processedWebhooks.pspEventId, input.eventId));
			return { status: 'ignored', reason: 'featuring_lapse_not_applicable' };
		}

		return { status: 'processed', kind: 'purchase' };
	});
}
