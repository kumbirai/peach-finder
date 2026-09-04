import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULTS, validateCrossKeys } from './config-registry';

describe('ConfigRegistry', () => {
	it('seeds the LLD defaults', () => {
		expect(CONFIG_DEFAULTS['listing-billing.trial_period_days']).toBe(14);
		expect(CONFIG_DEFAULTS['listing-billing.listing_price_cents']).toBe(9900);
		expect(CONFIG_DEFAULTS['listing-billing.featuring_price_cents']).toBe(4900);
		expect(CONFIG_DEFAULTS['provider-availability.expiry_minutes']).toBe(240);
		expect(CONFIG_DEFAULTS['platform-configuration.operating_timezone']).toBe(
			'Africa/Johannesburg'
		);
	});

	it('rejects reminder lead >= expiry', () => {
		const values = {
			...CONFIG_DEFAULTS,
			'provider-availability.reminder_lead_minutes': 240,
			'provider-availability.expiry_minutes': 240
		};
		expect(validateCrossKeys(values).length).toBeGreaterThan(0);
	});

	it('rejects dunning offsets outside grace', () => {
		const values = {
			...CONFIG_DEFAULTS,
			'listing-billing.grace_period_days': 7,
			'listing-billing.dunning_offset_days': [1, 7]
		};
		expect(
			validateCrossKeys(values).some((i) => i.path === 'listing-billing.dunning_offset_days')
		).toBe(true);
	});
});
