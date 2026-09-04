import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { listings } from './schema';

export async function cancelListingForProfile(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<void> {
	await tx
		.update(listings)
		.set({ state: 'cancelled', updatedAt: now })
		.where(eq(listings.providerProfileId, providerProfileId));
}
