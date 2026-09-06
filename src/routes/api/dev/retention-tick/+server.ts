import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { anonymizePendingUsers } from '$lib/server/modules/identity-and-access';
import { purgeDormantThreads } from '$lib/server/modules/direct-messaging';
import { runAnalyticsMaintenanceTick } from '$lib/server/modules/provider-analytics';
import { runIdentityDocPurgeJob } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	now: z.string().datetime().optional()
});

/** Dev-only: run SR-APP-10 retention jobs for US-PRIV-03 Playwright and local verification. */
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

	const anonymized = await anonymizePendingUsers(db, now);
	const identityDocs = await runIdentityDocPurgeJob(db, now, correlationId);
	const dormantThreads = await purgeDormantThreads(db, now);
	const analytics = await runAnalyticsMaintenanceTick(db, now);

	return json({
		data: {
			now: now.toISOString(),
			anonymizedUsers: anonymized,
			identityDocs,
			dormantThreads,
			analytics
		}
	});
};
