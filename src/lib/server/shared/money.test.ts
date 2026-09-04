import { describe, expect, it } from 'vitest';
import { addMoney, money } from './money';

describe('Money', () => {
	it('stores integer cents in ZAR', () => {
		expect(money(9900)).toEqual({ cents: 9900, currency: 'ZAR' });
	});

	it('rejects floats', () => {
		expect(() => money(9.9)).toThrow('Money must be integer cents');
	});

	it('adds cents', () => {
		expect(addMoney(money(100), money(50)).cents).toBe(150);
	});
});
