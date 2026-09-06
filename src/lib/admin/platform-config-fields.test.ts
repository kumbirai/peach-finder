import { describe, expect, it } from 'vitest';
import { parseConfigFormValue, configValueToFormString } from './platform-config-fields';

describe('platform-config-fields', () => {
	it('round-trips dunning offsets', () => {
		const value = [1, 3, 6];
		expect(configValueToFormString('listing-billing.dunning_offset_days', value)).toBe('1, 3, 6');
		expect(parseConfigFormValue('listing-billing.dunning_offset_days', '1,3,6')).toEqual({
			ok: true,
			value: [1, 3, 6]
		});
	});

	it('parses numeric config values', () => {
		expect(parseConfigFormValue('listing-billing.trial_period_days', '21')).toEqual({
			ok: true,
			value: 21
		});
	});

	it('rejects invalid dunning offsets', () => {
		expect(parseConfigFormValue('listing-billing.dunning_offset_days', '1, bad')).toEqual({
			ok: false,
			message: 'Use comma-separated whole numbers.'
		});
	});

	it('rejects fractional values for integer config keys', () => {
		expect(parseConfigFormValue('listing-billing.trial_period_days', '14.5')).toEqual({
			ok: false,
			message: 'Enter a whole number.'
		});
	});

	it('allows fractional highly rated minimum average', () => {
		expect(parseConfigFormValue('provider-reviews.highly_rated_min_average', '4.5')).toEqual({
			ok: true,
			value: 4.5
		});
	});
});
