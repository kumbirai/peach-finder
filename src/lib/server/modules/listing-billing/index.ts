import type { Database, Transaction } from '../../db';
import type { UserId } from '../../shared/ids';
import { getOwnedProfileIdDb } from '../provider-profile';
import { getSubscription } from './infra/subscription-read';
import { cancelListingForProfile } from './infra/cancel-on-delete';
import { ensureBuildingListing } from './infra/ensure-building-listing';
import { startTrialOnPublish } from './infra/start-trial-on-publish';
import { handlePhoneVerifiedForTrialEligibility } from './infra/trial-eligibility-handler';
import { runBillingLifecycleTick } from './infra/daily-lifecycle-job';

export {
	startTrialOnPublish,
	ensureBuildingListing,
	handlePhoneVerifiedForTrialEligibility,
	runBillingLifecycleTick
};
export {
	getSubscription,
	getActiveListingCount,
	listDiscoverableListedProfileIds,
	listingStateLabel,
	type SubscriptionSummary
} from './infra/subscription-read';
export {
	getActiveFeaturing,
	getActiveFeaturingActivatedAt,
	listFeaturingActivationsInRange,
	type FeaturingActivationEvent
} from './infra/featuring-read';
export {
	getBillingStatusForOwner,
	getSelfServeBillingForOwner,
	type BillingStatusDto,
	type SelfServeBillingDto
} from './app/get-billing-status-for-owner';
export {
	buildProviderBillingStatusView,
	formatBillingDate,
	formatListingPrice,
	type ProviderBillingStatusView
} from './domain/billing-status';
export {
	resolveTrialStartPlan,
	inferResumedListingState,
	isResumablePriorListing,
	type BillingContinuity,
	type TrialStartPlan
} from './domain/trial-eligibility';
export {
	initializePaymentMethodForOwner,
	completePaymentMethodForOwner,
	getBillingPriceForOwner,
	cancelListingRenewalForOwner,
	type BillingPriceDto,
	type InitializePaymentMethodResult
} from './app/self-serve-billing';
export { getBillingHistoryForOwner } from './app/get-billing-history';
export { initiateListingPaymentForOwner } from './app/initiate-listing-payment';
export {
	purchaseFeaturingForOwner,
	completeFeaturingPurchaseForOwner,
	cancelFeaturingRenewalForOwner
} from './app/purchase-featuring';
export { createPaymentGateway, getFakePaymentGateway } from './infra/payment-gateway-factory';

export async function cancelListingForOwner(
	tx: Transaction,
	ownerId: UserId,
	now: Date
): Promise<void> {
	const profileId = await getOwnedProfileIdDb(tx as Database, ownerId);
	if (!profileId) return;
	await cancelListingForProfile(tx, profileId, now);
}

export async function exportFor(userId: UserId): Promise<{
	listing?: {
		state: string;
		listingLabel: string;
		trialEndsAt: string | null;
		graceEndsAt: string | null;
		cancelAtPeriodEnd: boolean;
	};
}> {
	const { getDb } = await import('../../db');
	const profileId = await getOwnedProfileIdDb(getDb(), userId);
	if (!profileId) return {};
	const subscription = await getSubscription(getDb(), profileId);
	if (!subscription) return {};
	return {
		listing: {
			state: subscription.state,
			listingLabel: subscription.listingLabel,
			trialEndsAt: subscription.trialEndsAt,
			graceEndsAt: subscription.graceEndsAt,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
		}
	};
}
