import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { listings } from './schema';

export async function savePaymentMethod(
	db: Database,
	providerProfileId: ProviderProfileId,
	input: {
		pspCustomerRef: string;
		pspAuthorizationCode: string;
		cardLast4: string;
		cardBrand: string;
		now: Date;
	}
): Promise<void> {
	await db
		.update(listings)
		.set({
			pspCustomerRef: input.pspCustomerRef,
			pspAuthorizationCode: input.pspAuthorizationCode,
			cardLast4: input.cardLast4,
			cardBrand: input.cardBrand,
			updatedAt: input.now
		})
		.where(eq(listings.providerProfileId, providerProfileId));
}

export async function cancelListingRenewal(
	db: Database,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<boolean> {
	const rows = await db
		.update(listings)
		.set({
			cancelAtPeriodEnd: true,
			updatedAt: now
		})
		.where(eq(listings.providerProfileId, providerProfileId))
		.returning({ state: listings.state });

	return rows.length > 0;
}

export async function getListingBillingRow(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<typeof listings.$inferSelect | null> {
	const rows = await db
		.select()
		.from(listings)
		.where(eq(listings.providerProfileId, providerProfileId))
		.limit(1);
	return rows[0] ?? null;
}
