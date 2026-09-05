import type { Transaction } from '../../../db';
import { upsertSearchProjection } from '../../discovery-search';
import type { ProviderProfileId } from '../../../shared/ids';
import { eq } from 'drizzle-orm';
import { providerProfiles } from './schema';

export async function refreshSearchProjectionIfPublished(
	tx: Transaction,
	profileId: ProviderProfileId,
	now: Date
): Promise<void> {
	const rows = await tx
		.select({ publishState: providerProfiles.publishState })
		.from(providerProfiles)
		.where(eq(providerProfiles.id, profileId))
		.limit(1);
	if (rows[0]?.publishState !== 'published') return;
	await upsertSearchProjection(tx, profileId, now);
}
