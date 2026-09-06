import { and, eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { getConfig } from '../../platform-configuration';
import { dayInGrace } from '../domain/subscription-state';
import { applyListingBillingTransition } from './billing-transitions';
import { dunningDispatches, listings } from './schema';
import type { PaymentGateway } from '../app/ports';
import { dispatchGraceDunningReminder } from '../../user-notifications';
import { listFeaturingRenewalDue } from './featuring-read';
import { forceLapseFeaturing } from './featuring-transitions';

export type BillingLifecycleTickResult = {
	trialToGrace: number;
	renewalToGrace: number;
	graceToUnpublished: number;
	dunningDispatched: number;
	featuringLapsed: number;
	featuringRenewalCharged: number;
};

export async function runBillingLifecycleTick(
	db: Database,
	now: Date,
	correlationId: string,
	gateway?: PaymentGateway
): Promise<BillingLifecycleTickResult> {
	const result: BillingLifecycleTickResult = {
		trialToGrace: 0,
		renewalToGrace: 0,
		graceToUnpublished: 0,
		dunningDispatched: 0,
		featuringLapsed: 0,
		featuringRenewalCharged: 0
	};

	const trialDue = await db
		.select({ providerProfileId: listings.providerProfileId })
		.from(listings)
		.where(and(eq(listings.state, 'free_listed'), lt(listings.trialEndsAt, now)));

	for (const row of trialDue) {
		const applied = await db.transaction(async (tx) => {
			const transition = await applyListingBillingTransition(tx, {
				providerProfileId: row.providerProfileId as ProviderProfileId,
				kind: 'free_listed_to_grace',
				now,
				correlationId
			});
			return transition.applied;
		});
		if (applied) result.trialToGrace += 1;
	}

	const renewalDue = await db
		.select({
			providerProfileId: listings.providerProfileId,
			pspAuthorizationCode: listings.pspAuthorizationCode,
			pspCustomerRef: listings.pspCustomerRef
		})
		.from(listings)
		.where(and(eq(listings.state, 'paid_listed'), lt(listings.currentPeriodEndsAt, now)));

	for (const row of renewalDue) {
		let charged = false;
		if (gateway && row.pspAuthorizationCode && row.pspCustomerRef) {
			const charge = await gateway.chargeAuthorization({
				authorizationCode: row.pspAuthorizationCode,
				customerCode: row.pspCustomerRef,
				amountCents: getConfig('listing-billing.listing_price_cents'),
				metadata: { providerProfileId: row.providerProfileId }
			});
			charged = charge.ok;
		}

		if (!charged) {
			const applied = await db.transaction(async (tx) => {
				const transition = await applyListingBillingTransition(tx, {
					providerProfileId: row.providerProfileId as ProviderProfileId,
					kind: 'paid_listed_to_grace',
					now,
					correlationId
				});
				return transition.applied;
			});
			if (applied) result.renewalToGrace += 1;
		}
	}

	const graceExpired = await db
		.select({ providerProfileId: listings.providerProfileId })
		.from(listings)
		.where(and(eq(listings.state, 'grace'), lt(listings.graceEndsAt, now)));

	for (const row of graceExpired) {
		const applied = await db.transaction(async (tx) => {
			const transition = await applyListingBillingTransition(tx, {
				providerProfileId: row.providerProfileId as ProviderProfileId,
				kind: 'grace_to_unpublished',
				now,
				correlationId
			});
			return transition.applied;
		});
		if (applied) result.graceToUnpublished += 1;
	}

	const gracePeriodDays = getConfig('listing-billing.grace_period_days');
	const dunningOffsets = getConfig('listing-billing.dunning_offset_days');
	const inGrace = await db
		.select({
			providerProfileId: listings.providerProfileId,
			graceEndsAt: listings.graceEndsAt
		})
		.from(listings)
		.where(eq(listings.state, 'grace'));

	for (const row of inGrace) {
		if (!row.graceEndsAt) continue;
		const day = dayInGrace(row.graceEndsAt, gracePeriodDays, now);
		if (!dunningOffsets.includes(day)) continue;

		const inserted = await db
			.insert(dunningDispatches)
			.values({
				providerProfileId: row.providerProfileId,
				dayInGrace: day,
				dispatchedAt: now
			})
			.onConflictDoNothing()
			.returning({ providerProfileId: dunningDispatches.providerProfileId });

		if (inserted.length > 0) {
			result.dunningDispatched += 1;
			await dispatchGraceDunningReminder(db, {
				providerProfileId: row.providerProfileId as ProviderProfileId,
				graceEndsAt: row.graceEndsAt,
				dayInGrace: day,
				correlationId,
				now
			});
		}
	}

	const featuringDue = await listFeaturingRenewalDue(db, now);
	for (const row of featuringDue) {
		if (row.cancelAtPeriodEnd) {
			const applied = await db.transaction(async (tx) => {
				const lapsed = await forceLapseFeaturing(tx, {
					providerProfileId: row.providerProfileId,
					now,
					correlationId,
					reason: 'cancelled'
				});
				return lapsed.applied;
			});
			if (applied) result.featuringLapsed += 1;
			continue;
		}

		let charged = false;
		if (gateway && row.pspAuthorizationCode && row.pspCustomerRef) {
			const charge = await gateway.chargeAuthorization({
				authorizationCode: row.pspAuthorizationCode,
				customerCode: row.pspCustomerRef,
				amountCents: getConfig('listing-billing.featuring_price_cents'),
				metadata: { providerProfileId: row.providerProfileId, lineItem: 'featuring' }
			});
			charged = charge.ok;
		}

		if (charged) {
			result.featuringRenewalCharged += 1;
		} else {
			const applied = await db.transaction(async (tx) => {
				const lapsed = await forceLapseFeaturing(tx, {
					providerProfileId: row.providerProfileId,
					now,
					correlationId,
					reason: 'payment_failed'
				});
				return lapsed.applied;
			});
			if (applied) result.featuringLapsed += 1;
		}
	}

	return result;
}
