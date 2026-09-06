export type InvoiceLineItem = 'listing' | 'featuring';
export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type ProviderInvoiceView = {
	id: string;
	lineItem: InvoiceLineItem;
	lineItemLabel: string;
	amountCents: number;
	amountLabel: string;
	currency: 'ZAR';
	status: InvoiceStatus;
	statusLabel: string;
	issuedAt: string;
	paidAt: string | null;
	pspInvoiceRef: string | null;
};

const LINE_ITEM_LABELS: Record<InvoiceLineItem, string> = {
	listing: 'Listing subscription',
	featuring: 'Featuring add-on'
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
	pending: 'Pending',
	paid: 'Paid',
	failed: 'Failed',
	refunded: 'Refunded'
};

export function formatInvoiceAmount(cents: number): string {
	return `R${Math.round(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toProviderInvoiceView(input: {
	id: string;
	lineItem: InvoiceLineItem;
	amountCents: number;
	currency: 'ZAR';
	status: InvoiceStatus;
	issuedAt: string;
	paidAt: string | null;
	pspInvoiceRef: string | null;
}): ProviderInvoiceView {
	return {
		id: input.id,
		lineItem: input.lineItem,
		lineItemLabel: LINE_ITEM_LABELS[input.lineItem],
		amountCents: input.amountCents,
		amountLabel: formatInvoiceAmount(input.amountCents),
		currency: input.currency,
		status: input.status,
		statusLabel: STATUS_LABELS[input.status],
		issuedAt: input.issuedAt,
		paidAt: input.paidAt,
		pspInvoiceRef: input.pspInvoiceRef
	};
}

export function canCancelListingRenewal(input: {
	state: string;
	currentPeriodEndsAt: string | null;
	cancelAtPeriodEnd: boolean;
}): boolean {
	return (
		input.state === 'paid_listed' && input.currentPeriodEndsAt !== null && !input.cancelAtPeriodEnd
	);
}
