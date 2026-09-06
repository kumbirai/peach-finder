/** SAQ-A guard: reject any request body field that could carry raw card data. */
const FORBIDDEN_CARD_FIELDS = [
	'card',
	'cardNumber',
	'card_number',
	'pan',
	'cvv',
	'cvc',
	'expiry',
	'expiryMonth',
	'expiryYear',
	'exp_month',
	'exp_year',
	'pin'
] as const;

export function assertNoCardDataInBody(body: Record<string, unknown>): string | null {
	for (const key of Object.keys(body)) {
		const lower = key.toLowerCase();
		if (FORBIDDEN_CARD_FIELDS.some((field) => lower.includes(field.toLowerCase()))) {
			return 'Card details must be entered on our secure payment partner page — never here.';
		}
	}
	return null;
}

export type PaymentMethodSummary = {
	onFile: boolean;
	cardLast4: string | null;
	cardBrand: string | null;
};

export function buildPaymentMethodSummary(input: {
	pspCustomerRef: string | null;
	cardLast4?: string | null;
	cardBrand?: string | null;
}): PaymentMethodSummary {
	if (!input.pspCustomerRef) {
		return { onFile: false, cardLast4: null, cardBrand: null };
	}
	return {
		onFile: true,
		cardLast4: input.cardLast4 ?? '••••',
		cardBrand: input.cardBrand ?? 'Card'
	};
}
