import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listings } from '$lib/server/modules/listing-billing/infra/schema';
import { eq } from 'drizzle-orm';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

export const _requiredRole: Role = 'anonymous';

const PaidListingSchema = z.object({
	currentPeriodEndsAt: z.string().datetime().optional()
});

/** Dev-only: seed paid listing state for US-BILL-03 cancel-renewal Playwright. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = PaidListingSchema.safeParse(await request.json().catch(() => ({})));
	const now = new Date();
	const periodEnd =
		body.success && body.data.currentPeriodEndsAt
			? new Date(body.data.currentPeriodEndsAt)
			: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

	const db = getDb();
	await db
		.update(listings)
		.set({
			state: 'paid_listed',
			currentPeriodEndsAt: periodEnd,
			cancelAtPeriodEnd: false,
			pspCustomerRef: 'CUS_dev_seed',
			pspAuthorizationCode: 'AUTH_dev_seed',
			cardLast4: '4242',
			cardBrand: 'Visa',
			updatedAt: now
		})
		.where(eq(listings.providerProfileId, SEED_DUAL_ROLE_PROFILE_ID));

	return json({
		data: {
			providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
			state: 'paid_listed',
			currentPeriodEndsAt: periodEnd.toISOString()
		}
	});
};
