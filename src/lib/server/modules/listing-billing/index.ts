import type { Database, Transaction } from '../../db';
import type { UserId } from '../../shared/ids';
import { getOwnedProfileIdDb } from '../provider-profile';
import { cancelListingForProfile } from './infra/cancel-on-delete';
import { ensureBuildingListing } from './infra/ensure-building-listing';
import { startTrialOnPublish } from './infra/start-trial-on-publish';

export { startTrialOnPublish, ensureBuildingListing };
export {
	getSubscription,
	getActiveListingCount,
	listingStateLabel,
	type SubscriptionSummary
} from './infra/subscription-read';
export {
	getBillingStatusForOwner,
	type BillingStatusDto
} from './app/get-billing-status-for-owner';
export {
	buildProviderBillingStatusView,
	formatBillingDate,
	formatListingPrice,
	type ProviderBillingStatusView
} from './domain/billing-status';

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
