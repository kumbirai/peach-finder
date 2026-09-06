import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { publicAppOrigin } from '$lib/server/env';
import {
	createPaymentGateway,
	initiateListingPaymentForOwner,
	getFakePaymentGateway
} from '$lib/server/modules/listing-billing';
import { processPaystackWebhook } from '$lib/server/modules/listing-billing/infra/webhook-handler';
import { dispatchUndispatchedBillingSubscribers } from '$lib/server/modules/listing-billing/infra/dev-dispatch';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const appOrigin = publicAppOrigin();
	const gateway = createPaymentGateway(appOrigin);
	const result = await initiateListingPaymentForOwner(
		db,
		locals.auth.userId!,
		gateway,
		locals.correlationId
	);

	if (!result.ok) {
		const http = useCaseErrorToHttp(result.error);
		return json(http.body, { status: http.status });
	}

	if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
		const fake = getFakePaymentGateway(appOrigin);
		const eventId = `evt_inline_${crypto.randomUUID()}`;
		const payload = fake.buildWebhookPayload(result.value.reference, eventId, 'charge.success');
		if (payload) {
			await processPaystackWebhook(
				db,
				JSON.parse(payload.body) as never,
				locals.correlationId,
				new Date()
			);
			try {
				await dispatchUndispatchedBillingSubscribers(db);
			} catch {
				// Payment state is committed; subscriber dispatch can be retried by the worker/dev tick.
			}
		}
	}

	return json(success(result.value));
};
