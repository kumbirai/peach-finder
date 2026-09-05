import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { listings } from './schema';

export async function ensureBuildingListing(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<void> {
	const existing = await tx
		.select({ providerProfileId: listings.providerProfileId })
		.from(listings)
		.where(eq(listings.providerProfileId, providerProfileId))
		.limit(1);
	if (existing[0]) return;

	await tx.insert(listings).values({
		providerProfileId,
		state: 'building',
		updatedAt: now
	});
}
