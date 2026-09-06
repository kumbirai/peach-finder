import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { listings } from '$lib/server/modules/listing-billing/infra/schema';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	continuity: z.enum(['resumed', 'no_trial']),
	state: z.enum(['free_listed', 'grace'])
});

/** Dev-only: snapshot billing continuity states for US-BILL-02 Playwright assertions. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = BodySchema.safeParse(await request.json().catch(() => ({})));
	if (!body.success) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const now = new Date();
	const graceEndsAt = new Date(now);
	graceEndsAt.setUTCDate(graceEndsAt.getUTCDate() + 7);
	const trialEndsAt = new Date(now);
	trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + 10);

	const db = getDb();
	await db
		.update(listings)
		.set({
			state: body.data.state,
			billingContinuity: body.data.continuity,
			trialStartedAt: body.data.state === 'free_listed' ? now : null,
			trialEndsAt: body.data.state === 'free_listed' ? trialEndsAt : null,
			graceEndsAt: body.data.state === 'grace' ? graceEndsAt : null,
			updatedAt: now
		})
		.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

	return json({
		data: {
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			state: body.data.state,
			billingContinuity: body.data.continuity
		}
	});
};
