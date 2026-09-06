import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { insertInvoice } from '$lib/server/modules/listing-billing/infra/invoice-read';
import { getConfig } from '$lib/server/modules/platform-configuration';
import { newId, asId } from '$lib/server/shared/ids';
import { SEED_DUAL_ROLE_PROFILE_ID } from '../../../../../scripts/seed-core';

export const _requiredRole: Role = 'anonymous';

const SeedInvoicesSchema = z.object({
	count: z.number().int().min(1).max(5).default(2)
});

/** Dev-only: seed itemized invoices for US-BILL-03 Playwright. */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const body = SeedInvoicesSchema.safeParse(await request.json().catch(() => ({})));
	const count = body.success ? body.data.count : 2;
	const listingPrice = getConfig('listing-billing.listing_price_cents');
	const featuringPrice = getConfig('listing-billing.featuring_price_cents');
	const now = new Date();
	const db = getDb();

	for (let i = 0; i < count; i++) {
		const issuedAt = new Date(now.getTime() - (count - i) * 24 * 60 * 60 * 1000);
		const paidAt = new Date(issuedAt.getTime() + 60_000);
		await insertInvoice(db, {
			id: newId(),
			providerProfileId: asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID),
			lineItem: i % 2 === 0 ? 'listing' : 'featuring',
			amountCents: i % 2 === 0 ? listingPrice : featuringPrice,
			status: 'paid',
			pspInvoiceRef: `TX_dev_${i + 1}`,
			issuedAt,
			paidAt
		});
	}

	return json({ data: { inserted: count } });
};
