import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { catchUpMessageSentNotificationLedger, forceFlushOpenNotificationBatchWindows } from '$lib/server/modules/user-notifications';

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
	await catchUpMessageSentNotificationLedger(db);
	const flushed = await forceFlushOpenNotificationBatchWindows(db, now);

	return json({
		data: {
			now: now.toISOString(),
			flushed
		}
	});
};
