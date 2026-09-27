import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	corruptAvailabilityOnProjection,
	runSearchProjectionReconcile
} from '$lib/server/modules/discovery-search';
import { asId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	action: z.enum(['corrupt_availability', 'reconcile']),
	providerProfileId: z.string().uuid().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const db = getDb();
	if (parsed.data.action === 'corrupt_availability') {
		if (!parsed.data.providerProfileId) {
			return json({ error: 'providerProfileId required' }, { status: 422 });
		}
		const corrupted = await corruptAvailabilityOnProjection(
			db,
			asId<'ProviderProfileId'>(parsed.data.providerProfileId)
		);
		return json({ data: { corrupted } });
	}

	const result = await runSearchProjectionReconcile(db, new Date());
	return json({ data: result });
};
