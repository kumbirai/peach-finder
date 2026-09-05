import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { runActiveThisWeekJob, handleBadgeFlagEvent } from '$lib/server/modules/trust-and-safety';
import { claimUndispatched } from '$lib/server/shared/outbox';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	now: z.string().datetime().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = BodySchema.safeParse(await request.json().catch(() => ({})));
	if (!body.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const now = body.data.now ? new Date(body.data.now) : new Date();
	const db = getDb();
	const correlationId = crypto.randomUUID();
	const result = await runActiveThisWeekJob(db, now, correlationId);

	const rows = await claimUndispatched(db, 200);
	for (const row of rows) {
		if (row.eventName === 'BadgeGranted' || row.eventName === 'BadgeRevoked') {
			await handleBadgeFlagEvent(db, {
				eventId: row.eventId,
				eventName: row.eventName,
				version: row.version,
				occurredAt: row.occurredAt.toISOString(),
				correlationId: row.correlationId,
				payload: row.payload
			} as never);
		}
	}

	return json({
		data: {
			now: now.toISOString(),
			evaluated: result.evaluated,
			granted: result.granted,
			revoked: result.revoked
		}
	});
};
