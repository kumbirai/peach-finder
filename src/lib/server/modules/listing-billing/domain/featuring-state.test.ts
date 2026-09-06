import { describe, expect, it } from 'vitest';
import {
	canCancelFeaturingRenewal,
	canPurchaseFeaturing,
	isFeaturableListingState
} from './featuring-state';

describe('featuring-state', () => {
	it('allows purchase only on active listing states with payment method', () => {
		expect(isFeaturableListingState('paid_listed')).toBe(true);
		expect(isFeaturableListingState('grace')).toBe(false);

		expect(
			canPurchaseFeaturing({
				listingState: 'paid_listed',
				hasActiveFeaturing: false,
				hasPaymentMethod: true
			})
		).toBe(true);

		expect(
			canPurchaseFeaturing({
				listingState: 'unpublished',
				hasActiveFeaturing: false,
				hasPaymentMethod: true
			})
		).toBe(false);
	});

	it('allows cancel renewal only while featuring is active and not already cancelled', () => {
		expect(
			canCancelFeaturingRenewal({
				active: true,
				currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
				cancelAtPeriodEnd: false
			})
		).toBe(true);

		expect(
			canCancelFeaturingRenewal({
				active: true,
				currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
				cancelAtPeriodEnd: true
			})
		).toBe(false);
	});
});
