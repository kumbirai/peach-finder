export type FeaturingState = 'active' | 'lapsed';

export type FeaturingLapseReason = 'cancelled' | 'payment_failed' | 'listing_lapsed';

export const FEATURABLE_LISTING_STATES = ['free_listed', 'paid_listed'] as const;

export function isFeaturableListingState(state: string): boolean {
	return (FEATURABLE_LISTING_STATES as readonly string[]).includes(state);
}

export function canPurchaseFeaturing(input: {
	listingState: string;
	hasActiveFeaturing: boolean;
	hasPaymentMethod: boolean;
}): boolean {
	return (
		isFeaturableListingState(input.listingState) &&
		!input.hasActiveFeaturing &&
		input.hasPaymentMethod
	);
}

export function canCancelFeaturingRenewal(input: {
	active: boolean;
	currentPeriodEndsAt: string | null;
	cancelAtPeriodEnd: boolean;
}): boolean {
	return input.active && input.currentPeriodEndsAt !== null && !input.cancelAtPeriodEnd;
}
