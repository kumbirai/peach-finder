import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { searchProjection } from './schema';

export async function removeSearchProjection(
	tx: Transaction,
	providerProfileId: ProviderProfileId
): Promise<void> {
	await tx
		.delete(searchProjection)
		.where(eq(searchProjection.providerProfileId, providerProfileId));
}
