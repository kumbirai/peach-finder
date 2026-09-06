import { describe, expect, it } from 'vitest';
import { assertNoCardDataInBody, buildPaymentMethodSummary } from './payment-method';

describe('payment-method domain', () => {
	it('TC-BILL-03a: rejects card data fields in request bodies', () => {
		expect(assertNoCardDataInBody({ returnUrl: 'https://example.com' })).toBeNull();
		expect(assertNoCardDataInBody({ cardNumber: '4111111111111111' })).toContain(
			'secure payment partner'
		);
		expect(assertNoCardDataInBody({ pan: '4111111111111111' })).toContain('secure payment partner');
	});

	it('builds payment method summary without exposing PSP refs', () => {
		expect(buildPaymentMethodSummary({ pspCustomerRef: null })).toEqual({
			onFile: false,
			cardLast4: null,
			cardBrand: null
		});
		expect(
			buildPaymentMethodSummary({
				pspCustomerRef: 'CUS_abc',
				cardLast4: '4242',
				cardBrand: 'Visa'
			})
		).toEqual({
			onFile: true,
			cardLast4: '4242',
			cardBrand: 'Visa'
		});
	});
});
