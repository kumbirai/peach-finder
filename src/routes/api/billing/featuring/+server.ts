import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { publicAppOrigin } from '$lib/server/env';
import {
	completeFeaturingPurchaseForOwner,
	createPaymentGateway,
	getFakePaymentGateway,
	purchaseFeaturingForOwner
} from '$lib/server/modules/listing-billing';
import { dispatchUndispatchedBillingSubscribers } from '$lib/server/modules/listing-billing/infra/dev-dispatch';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const appOrigin = publicAppOrigin();
	const gateway = createPaymentGateway(appOrigin);
	const now = new Date();
	const result = await purchaseFeaturingForOwner(
		db,
		locals.auth.userId!,
		gateway,
		locals.correlationId,
		now
	);

	if (!result.ok) {
		const http = useCaseErrorToHttp(result.error);
		return json(http.body, { status: http.status });
	}

	if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
		const eventId = `evt_featuring_${crypto.randomUUID()}`;
		const complete = await completeFeaturingPurchaseForOwner(
			db,
			locals.auth.userId!,
			result.value.reference,
			locals.correlationId,
			now,
			eventId
		);
		if (!complete.ok) {
			const http = useCaseErrorToHttp(complete.error);
			return json(http.body, { status: http.status });
		}
		try {
			await dispatchUndispatchedBillingSubscribers(db);
		} catch {
			// Payment state is committed; subscriber dispatch can be retried by the worker/dev tick.
		}
	}

	return json(success(result.value));
};
