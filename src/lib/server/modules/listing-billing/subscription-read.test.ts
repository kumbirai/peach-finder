import { describe, expect, it } from 'vitest';
import { listingStateLabel } from './infra/subscription-read';

describe('listingStateLabel', () => {
	it('maps live listing states to admin-friendly labels', () => {
		expect(listingStateLabel('free_listed')).toBe('Active listing');
		expect(listingStateLabel('paid_listed')).toBe('Active listing');
		expect(listingStateLabel('grace')).toBe('Grace period');
	});
});
