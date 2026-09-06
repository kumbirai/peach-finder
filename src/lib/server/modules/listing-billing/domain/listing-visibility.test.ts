import { describe, expect, it } from 'vitest';
import { isDiscoverableListingState } from './listing-visibility';

describe('listing visibility', () => {
	it('treats grace as discoverable while unpublished is not', () => {
		expect(isDiscoverableListingState('free_listed')).toBe(true);
		expect(isDiscoverableListingState('paid_listed')).toBe(true);
		expect(isDiscoverableListingState('grace')).toBe(true);
		expect(isDiscoverableListingState('unpublished')).toBe(false);
	});
});
