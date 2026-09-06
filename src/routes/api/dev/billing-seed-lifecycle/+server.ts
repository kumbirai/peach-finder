import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listings } from '$lib/server/modules/listing-billing/infra/schema';
import { eq } from 'drizzle-orm';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	state: z.enum(['free_listed', 'paid_listed', 'grace', 'unpublished']).optional(),
	trialEndsAt: z.string().datetime().optional(),
	graceEndsAt: z.string().datetime().optional(),
	currentPeriodEndsAt: z.string().datetime().optional()
});

/** Dev-only: seed listing lifecycle state for US-BILL-04 Playwright. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = BodySchema.safeParse(await request.json().catch(() => ({})));
	const now = new Date();
	const db = getDb();

	const updates: Partial<typeof listings.$inferInsert> = {
		updatedAt: now,
		state: body.success && body.data.state ? body.data.state : 'free_listed',
		pspCustomerRef: 'CUS_dev_seed',
		pspAuthorizationCode: 'AUTH_dev_seed',
		cardLast4: '4242',
		cardBrand: 'Visa'
	};

	if (body.success && body.data.trialEndsAt) {
		updates.trialEndsAt = new Date(body.data.trialEndsAt);
	}
	if (body.success && body.data.graceEndsAt) {
		updates.graceEndsAt = new Date(body.data.graceEndsAt);
	}
	if (body.success && body.data.currentPeriodEndsAt) {
		updates.currentPeriodEndsAt = new Date(body.data.currentPeriodEndsAt);
	}

	await db
		.update(listings)
		.set(updates)
		.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

	return json({
		data: {
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			...updates,
			trialEndsAt: updates.trialEndsAt?.toISOString() ?? null,
			graceEndsAt: updates.graceEndsAt?.toISOString() ?? null,
			currentPeriodEndsAt: updates.currentPeriodEndsAt?.toISOString() ?? null
		}
	});
};
