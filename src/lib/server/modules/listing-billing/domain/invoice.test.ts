import { describe, expect, it } from 'vitest';
import { canCancelListingRenewal, formatInvoiceAmount, toProviderInvoiceView } from './invoice';

describe('invoice domain', () => {
	it('formats invoice amounts as ZAR', () => {
		expect(formatInvoiceAmount(9900)).toMatch(/^R99[.,]00$/);
	});

	it('maps invoice rows for provider-facing history', () => {
		const view = toProviderInvoiceView({
			id: '01900000-0000-7000-8000-000000000001',
			lineItem: 'listing',
			amountCents: 9900,
			currency: 'ZAR',
			status: 'paid',
			issuedAt: '2026-09-01T10:00:00.000Z',
			paidAt: '2026-09-01T10:01:00.000Z',
			pspInvoiceRef: 'TX_123'
		});
		expect(view.lineItemLabel).toBe('Listing subscription');
		expect(view.amountLabel).toMatch(/^R99[.,]00$/);
		expect(view.pspInvoiceRef).toBe('TX_123');
	});

	it('TC-BILL-03c: allows cancel renewal only for active paid periods', () => {
		expect(
			canCancelListingRenewal({
				state: 'paid_listed',
				currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
				cancelAtPeriodEnd: false
			})
		).toBe(true);
		expect(
			canCancelListingRenewal({
				state: 'paid_listed',
				currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
				cancelAtPeriodEnd: true
			})
		).toBe(false);
		expect(
			canCancelListingRenewal({
				state: 'free_listed',
				currentPeriodEndsAt: null,
				cancelAtPeriodEnd: false
			})
		).toBe(false);
	});
});
