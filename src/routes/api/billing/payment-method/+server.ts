import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	completePaymentMethodForOwner,
	createPaymentGateway,
	initializePaymentMethodForOwner
} from '$lib/server/modules/listing-billing';
import { publicAppOrigin } from '$lib/server/env';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

const BodySchema = z
	.object({
		returnUrl: z.string().url().optional()
	})
	.passthrough();

export const POST: RequestHandler = async ({ locals, request, url }) => {
	const raw = await request.json().catch(() => ({}));
	const parsed = BodySchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const appOrigin = publicAppOrigin();
	const returnUrl = parsed.data.returnUrl ?? `${appOrigin}/provider/billing?payment=complete`;
	const callbackUrl = `${appOrigin}/provider/billing/payment-method/complete?return=${encodeURIComponent(returnUrl)}`;

	const db = getDb();
	const gateway = createPaymentGateway(appOrigin);
	const result = await initializePaymentMethodForOwner(db, locals.auth.userId!, gateway, {
		callbackUrl,
		body: raw as Record<string, unknown>
	});

	if (!result.ok) {
		const http = useCaseErrorToHttp(result.error);
		return json(http.body, { status: http.status });
	}

	return json(success(result.value));
};

const CompleteSchema = z.object({
	reference: z.string().min(1)
});

export const PUT: RequestHandler = async ({ locals, request }) => {
	const parsed = CompleteSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const db = getDb();
	const gateway = createPaymentGateway(publicAppOrigin());
	const result = await completePaymentMethodForOwner(
		db,
		locals.auth.userId!,
		gateway,
		parsed.data.reference,
		new Date()
	);

	if (!result.ok) {
		const http = useCaseErrorToHttp(result.error);
		return json(http.body, { status: http.status });
	}

	return json(success(result.value));
};
