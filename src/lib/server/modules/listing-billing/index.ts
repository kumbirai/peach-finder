import type { Database, Transaction } from '../../db';
import type { UserId } from '../../shared/ids';
import { getOwnedProfileIdDb } from '../provider-profile';
import { cancelListingForProfile } from './infra/cancel-on-delete';
import { ensureBuildingListing } from './infra/ensure-building-listing';
import { startTrialOnPublish } from './infra/start-trial-on-publish';
import { handlePhoneVerifiedForTrialEligibility } from './infra/trial-eligibility-handler';
import { runBillingLifecycleTick } from './infra/daily-lifecycle-job';

export { startTrialOnPublish, ensureBuildingListing, handlePhoneVerifiedForTrialEligibility, runBillingLifecycleTick };
export {
	getSubscription,
	getActiveListingCount,
	listingStateLabel,
	type SubscriptionSummary
} from './infra/subscription-read';
export {
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

/** Wave 0 stub — populated by later waves. */
export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
