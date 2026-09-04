import { describe, expect, it } from 'vitest';
import { validateServiceInput } from './service-policy';

describe('validateServiceInput', () => {
	it('accepts a valid service', () => {
		expect(
			validateServiceInput({
				name: 'Deep tissue',
				durationMinutes: 60,
				priceCents: 35000
			})
		).toEqual([]);
	});

	it('rejects missing name', () => {
		expect(validateServiceInput({ name: ' ', durationMinutes: 60, priceCents: 100 })).toHaveLength(
			1
		);
	});

	it('rejects invalid duration', () => {
		expect(
			validateServiceInput({ name: 'Massage', durationMinutes: 0, priceCents: 100 })
		).toHaveLength(1);
	});
});
