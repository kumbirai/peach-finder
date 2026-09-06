import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getFakePaymentGateway } from '$lib/server/modules/listing-billing';
import { publicAppOrigin } from '$lib/server/env';

export const _requiredRole: Role = 'anonymous';

const CompleteFakeSchema = z.object({
	reference: z.string().min(1)
});

/** Dev-only: complete a fake PSP authorization (simulates hosted card capture). */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = CompleteFakeSchema.safeParse(await request.json().catch(() => ({})));
	if (!body.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const gateway = getFakePaymentGateway(publicAppOrigin());
	const completed = gateway.markCompleted(body.data.reference);
	return json({ data: { completed } });
};
