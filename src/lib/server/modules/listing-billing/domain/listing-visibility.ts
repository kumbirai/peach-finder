/** Listing states where the profile may remain published and discoverable (FR-MONET-04). */
export const DISCOVERABLE_LISTING_STATES = ['free_listed', 'paid_listed', 'grace'] as const;

export type DiscoverableListingState = (typeof DISCOVERABLE_LISTING_STATES)[number];

export function isDiscoverableListingState(state: string): boolean {
	return (DISCOVERABLE_LISTING_STATES as readonly string[]).includes(state);
}
