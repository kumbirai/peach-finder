import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { getConfig } from '../../platform-configuration';
import {
	buildProviderBillingStatusView,
	formatBillingDate,
	type ProviderBillingStatusView
} from '../domain/billing-status';
import { canCancelListingRenewal } from '../domain/invoice';
import { buildPaymentMethodSummary } from '../domain/payment-method';
import { getListingBillingRow } from '../infra/listing-billing-write';
import { getSubscription } from '../infra/subscription-read';
import { getActiveFeaturing } from '../infra/featuring-read';
import { canCancelFeaturingRenewal, canPurchaseFeaturing } from '../domain/featuring-state';

export type BillingStatusDto = {
	state: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	graceEndsAt: string | null;
	billingContinuity: string;
	gracePeriodDays: number;
	listingPriceCents: number;
	dashboard: ProviderBillingStatusView | null;
	featuring: FeaturingBillingDto;
};

export type FeaturingBillingDto = {
	active: boolean;
	cancelAtPeriodEnd: boolean;
	currentPeriodEndsAt: string | null;
	currentPeriodEndsLabel: string | null;
	canPurchase: boolean;
	canCancelRenewal: boolean;
};

export type SelfServeBillingDto = BillingStatusDto & {
	paymentMethod: ReturnType<typeof buildPaymentMethodSummary>;
	cancelAtPeriodEnd: boolean;
	currentPeriodEndsAt: string | null;
	currentPeriodEndsLabel: string | null;
	canCancelRenewal: boolean;
	featuringPriceCents: number;
	featuring: FeaturingBillingDto;
};

export async function getBillingStatusForOwner(
	db: Database,
	ownerId: UserId
): Promise<BillingStatusDto | null> {
	const selfServe = await getSelfServeBillingForOwner(db, ownerId);
	if (!selfServe) return null;
	const {
		paymentMethod: _pm,
		canCancelRenewal: _cc,
		featuringPriceCents: _fp,
		...status
	} = selfServe;
	return status;
}

export async function getSelfServeBillingForOwner(
	db: Database,
	ownerId: UserId
): Promise<SelfServeBillingDto | null> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) return null;

	const [subscription, listingRow, activeFeaturing] = await Promise.all([
		getSubscription(db, profileId),
		getListingBillingRow(db, profileId),
		getActiveFeaturing(db, profileId)
	]);
	if (!subscription || !listingRow) return null;

	const hasRenewalPaymentMethod = Boolean(
		listingRow.pspCustomerRef && listingRow.pspAuthorizationCode
	);

	const gracePeriodDays = getConfig('listing-billing.grace_period_days');
	const listingPriceCents = getConfig('listing-billing.listing_price_cents');
	const featuringPriceCents = getConfig('listing-billing.featuring_price_cents');

	const dashboard = buildProviderBillingStatusView({
		state: subscription.state,
		trialStartedAt: subscription.trialStartedAt,
		trialEndsAt: subscription.trialEndsAt,
		graceEndsAt: subscription.graceEndsAt,
		currentPeriodEndsAt: subscription.currentPeriodEndsAt,
		cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
		gracePeriodDays,
		listingPriceCents,
		billingContinuity: subscription.billingContinuity
	});

	return {
		state: subscription.state,
		trialStartedAt: subscription.trialStartedAt,
		trialEndsAt: subscription.trialEndsAt,
		graceEndsAt: subscription.graceEndsAt,
		billingContinuity: subscription.billingContinuity,
		gracePeriodDays,
		listingPriceCents,
		featuringPriceCents,
		dashboard,
		paymentMethod: buildPaymentMethodSummary({
			pspCustomerRef: hasRenewalPaymentMethod ? listingRow.pspCustomerRef : null,
			cardLast4: subscription.cardLast4,
			cardBrand: subscription.cardBrand
		}),
		cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
		currentPeriodEndsAt: subscription.currentPeriodEndsAt,
		currentPeriodEndsLabel: subscription.currentPeriodEndsAt
			? formatBillingDate(subscription.currentPeriodEndsAt)
			: null,
		canCancelRenewal: canCancelListingRenewal({
			state: subscription.state,
			currentPeriodEndsAt: subscription.currentPeriodEndsAt,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
		}),
		featuring: {
			active: activeFeaturing !== null,
			cancelAtPeriodEnd: activeFeaturing?.cancelAtPeriodEnd ?? false,
			currentPeriodEndsAt: activeFeaturing?.currentPeriodEndsAt ?? null,
			currentPeriodEndsLabel: activeFeaturing?.currentPeriodEndsAt
				? formatBillingDate(activeFeaturing.currentPeriodEndsAt)
				: null,
			canPurchase: canPurchaseFeaturing({
				listingState: subscription.state,
				hasActiveFeaturing: activeFeaturing !== null,
				hasPaymentMethod: hasRenewalPaymentMethod
			}),
			canCancelRenewal: canCancelFeaturingRenewal({
				active: activeFeaturing !== null,
				currentPeriodEndsAt: activeFeaturing?.currentPeriodEndsAt ?? null,
				cancelAtPeriodEnd: activeFeaturing?.cancelAtPeriodEnd ?? false
			})
		}
	};
}
