import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { publicAppOrigin } from '$lib/server/env';
import { getFakePaymentGateway } from '$lib/server/modules/listing-billing/infra/fake-payment-gateway';
import { processPaystackWebhook } from '$lib/server/modules/listing-billing/infra/webhook-handler';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	reference: z.string().min(1),
	eventId: z.string().min(1),
	event: z.enum(['charge.success', 'charge.failed']).default('charge.success')
});

/** Dev-only: deliver a fake PSP webhook for billing lifecycle E2E. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = BodySchema.safeParse(await request.json().catch(() => ({})));
	if (!body.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const gateway = getFakePaymentGateway(publicAppOrigin());
	const payload = gateway.buildWebhookPayload(
		body.data.reference,
		body.data.eventId,
		body.data.event
	);
	if (!payload) {
		return json({ error: 'Unknown charge reference' }, { status: 404 });
	}

	const db = getDb();
	const correlationId = crypto.randomUUID();
	const parsed = JSON.parse(payload.body) as {
		id: string;
		event: string;
		data: { reference?: string; amount?: number; metadata?: { providerProfileId?: string } };
	};
	const result = await processPaystackWebhook(db, parsed, correlationId, new Date());

	return json({
		data: {
			...result,
			webhookBody: payload.body,
			signature: payload.signature
		}
	});
};
