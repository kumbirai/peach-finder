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
			graceEndsAt: null,
			gracePeriodDays: 7,
			listingPriceCents: 9900,
			billingContinuity: 'new'
		});

		expect(view?.headline).toBe('Free listing period');
		expect(view?.stateChipLabel).toBe('Active listing');
		expect(view?.endDateLabel).toContain('September');
		expect(view?.whatHappensNext).toContain('7-day grace period');
		expect(view?.whatHappensNext).toContain('R99/month');
		expect(view?.whatHappensNext).toContain('hidden from search');
	});

	it('notes listing continuity for a resumed free period without accusatory framing', () => {
		const view = buildProviderBillingStatusView({
			state: 'free_listed',
			trialStartedAt: '2026-08-01T10:00:00.000Z',
			trialEndsAt: '2026-09-15T10:00:00.000Z',
			graceEndsAt: null,
			gracePeriodDays: 7,
			listingPriceCents: 9900,
			billingContinuity: 'resumed'
		});

		expect(view?.whatHappensNext).toContain('continues from your previous account');
		expect(view?.whatHappensNext.toLowerCase()).not.toContain('abuse');
		expect(view?.whatHappensNext.toLowerCase()).not.toContain('fraud');
	});

	it('builds plain grace-period copy when billing resumes on a reused number', () => {
		const view = buildProviderBillingStatusView({
			state: 'grace',
			trialStartedAt: null,
			trialEndsAt: null,
			graceEndsAt: '2026-09-20T10:00:00.000Z',
			gracePeriodDays: 7,
			listingPriceCents: 9900,
			billingContinuity: 'resumed'
		});

		expect(view?.headline).toBe('Listing billing');
		expect(view?.stateChipLabel).toBe('Grace period');
		expect(view?.whatHappensNext).toContain('continues from your previous account');
		expect(view?.whatHappensNext.toLowerCase()).not.toContain('abuse');
	});

	it('builds payment-required copy when the free period was already used on this number', () => {
		const view = buildProviderBillingStatusView({
			state: 'grace',
			trialStartedAt: null,
			trialEndsAt: null,
			graceEndsAt: '2026-09-05T12:00:00.000Z',
			gracePeriodDays: 7,
			listingPriceCents: 9900,
			billingContinuity: 'no_trial'
		});

		expect(view?.whatHappensNext).toContain('already used for a free listing period');
		expect(view?.whatHappensNext.toLowerCase()).not.toContain('abuse');
	});

	it('returns null when not in a dashboard-visible billing state', () => {
		expect(
			buildProviderBillingStatusView({
				state: 'paid_listed',
				trialStartedAt: null,
				trialEndsAt: null,
				graceEndsAt: null,
				gracePeriodDays: 7,
				listingPriceCents: 9900,
				billingContinuity: 'new'
			})
		).toBeNull();
	});

	it('returns null when free_listed but trial end is unknown', () => {
		expect(
			buildProviderBillingStatusView({
				state: 'free_listed',
				trialStartedAt: null,
				trialEndsAt: null,
				graceEndsAt: null,
				gracePeriodDays: 7,
				listingPriceCents: 9900,
				billingContinuity: 'new'
			})
		).toBeNull();
	});
});
