import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { getConfig } from '../../platform-configuration';
import {
	buildProviderBillingStatusView,
	type ProviderBillingStatusView
} from '../domain/billing-status';
import { getSubscription } from '../infra/subscription-read';

export type BillingStatusDto = {
	state: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	graceEndsAt: string | null;
	billingContinuity: string;
	gracePeriodDays: number;
	listingPriceCents: number;
	dashboard: ProviderBillingStatusView | null;
};

export async function getBillingStatusForOwner(
	db: Database,
	ownerId: UserId
): Promise<BillingStatusDto | null> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) return null;

	const subscription = await getSubscription(db, profileId);
	if (!subscription) return null;

	const gracePeriodDays = getConfig('listing-billing.grace_period_days');
	const listingPriceCents = getConfig('listing-billing.listing_price_cents');

	const dashboard = buildProviderBillingStatusView({
		state: subscription.state,
		trialStartedAt: subscription.trialStartedAt,
		trialEndsAt: subscription.trialEndsAt,
		graceEndsAt: subscription.graceEndsAt,
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
		dashboard
	};
}
