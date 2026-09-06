import { createHmac, timingSafeEqual } from 'node:crypto';

const FAKE_WEBHOOK_SECRET = 'peach-finder-fake-paystack-webhook-secret';

export function verifyPaystackWebhookSignature(
	rawBody: string,
	signatureHeader: string | null,
	secretKey: string
): boolean {
	if (!signatureHeader) return false;
	const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
	if (expected.length !== signatureHeader.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

export function fakeWebhookSecret(): string {
	return process.env.FAKE_PAYSTACK_WEBHOOK_SECRET?.trim() || FAKE_WEBHOOK_SECRET;
}

export function signFakeWebhookPayload(rawBody: string): string {
	return createHmac('sha512', fakeWebhookSecret()).update(rawBody).digest('hex');
}

export type PaystackWebhookEvent = {
	id: string;
	event: string;
	data: {
		reference?: string;
		amount?: number;
		metadata?: {
			providerProfileId?: string;
			ownerId?: string;
			invoiceId?: string;
			lineItem?: 'listing' | 'featuring';
		};
	};
};

export function parsePaystackWebhookBody(rawBody: string): PaystackWebhookEvent | null {
	try {
		const parsed = JSON.parse(rawBody) as PaystackWebhookEvent;
		if (!parsed?.id || !parsed?.event) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function paystackWebhookSecret(): string | null {
	const paystack = process.env.PAYSTACK_SECRET_KEY?.trim();
	if (paystack) return paystack;
	if (process.env.ALLOW_DEV_HELPERS === '1') return fakeWebhookSecret();
	return null;
}
