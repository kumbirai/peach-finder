import { describe, expect, it } from 'vitest';
import {
	isProductionHostname,
	isProductionUrl,
	productionTargetReason
} from './production-guard';

describe('peach-finder seeding production guard', () => {
	it('allows localhost and loopback', () => {
		expect(isProductionHostname('localhost')).toBe(false);
		expect(isProductionUrl('http://127.0.0.1:5173')).toBe(false);
	});

	it('blocks production apex hosts', () => {
		expect(isProductionHostname('peachfinder.com')).toBe(true);
		expect(isProductionHostname('www.peach-finder.com')).toBe(true);
		expect(isProductionUrl('https://app.peachfinder.com')).toBe(true);
	});

	it('allows labelled non-prod subdomains', () => {
		expect(isProductionHostname('staging.peachfinder.com')).toBe(false);
		expect(isProductionHostname('dev.peach-finder.com')).toBe(false);
		expect(isProductionHostname('local.peachfinder.com')).toBe(false);
	});

	it('reports the first production env URL', () => {
		expect(
			productionTargetReason({ E2E_BASE_URL: 'https://peachfinder.com', PUBLIC_APP_ORIGIN: '' })
		).toMatch(/E2E_BASE_URL/);
		expect(productionTargetReason({ E2E_BASE_URL: 'http://127.0.0.1:5173' })).toBeNull();
	});
});
