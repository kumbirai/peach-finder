import { describe, expect, it } from 'vitest';
import {
	buildProviderBillingStatusView,
	formatBillingDate,
	formatListingPrice
} from './billing-status';

describe('billing-status domain', () => {
	it('formats billing dates for provider-facing copy', () => {
		const label = formatBillingDate('2026-09-15T10:00:00.000Z');
		expect(label).toContain('2026');
		expect(label).toContain('September');
	});

	it('formats listing price in ZAR without decimals', () => {
		expect(formatListingPrice(9900)).toBe('R99');
	});

	it('builds dashboard copy for an active free listing', () => {
		const view = buildProviderBillingStatusView({
			state: 'free_listed',
			trialStartedAt: '2026-08-01T10:00:00.000Z',
			trialEndsAt: '2026-09-15T10:00:00.000Z',
			gracePeriodDays: 7,
			listingPriceCents: 9900
		});

		expect(view?.headline).toBe('Free listing period');
		expect(view?.endDateLabel).toContain('September');
		expect(view?.whatHappensNext).toContain('7-day grace period');
		expect(view?.whatHappensNext).toContain('R99/month');
		expect(view?.whatHappensNext).toContain('hidden from search');
	});

	it('returns null when not in free_listed state', () => {
		expect(
			buildProviderBillingStatusView({
				state: 'paid_listed',
				trialStartedAt: null,
				trialEndsAt: null,
				gracePeriodDays: 7,
				listingPriceCents: 9900
			})
		).toBeNull();
	});

	it('returns null when free_listed but trial end is unknown', () => {
		expect(
			buildProviderBillingStatusView({
				state: 'free_listed',
				trialStartedAt: null,
				trialEndsAt: null,
				gracePeriodDays: 7,
				listingPriceCents: 9900
			})
		).toBeNull();
	});
});
