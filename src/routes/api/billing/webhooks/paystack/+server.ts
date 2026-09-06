import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	parsePaystackWebhookBody,
	paystackWebhookSecret,
	verifyPaystackWebhookSignature
} from '$lib/server/modules/listing-billing/infra/webhook-signature';
import { processPaystackWebhook } from '$lib/server/modules/listing-billing/infra/webhook-handler';

export const _requiredRole: Role = 'anonymous';

export const POST: RequestHandler = async ({ request, locals }) => {
	const rawBody = await request.text();
	const signature = request.headers.get('x-paystack-signature');
	const secret = paystackWebhookSecret();

	if (!secret || !verifyPaystackWebhookSignature(rawBody, signature, secret)) {
		return new Response('Invalid signature', { status: 401 });
	}

	const event = parsePaystackWebhookBody(rawBody);
	if (!event) {
		return json({ error: 'Invalid webhook payload' }, { status: 400 });
	}

	const db = getDb();
	const result = await processPaystackWebhook(db, event, locals.correlationId, new Date());

	return json({ data: result });
};
