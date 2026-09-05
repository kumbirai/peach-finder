import { and, eq, gte } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { providerProfiles } from './schema';

export async function updatedAtSince(
	db: Database,
	providerProfileId: ProviderProfileId,
	since: Date
): Promise<boolean> {
	const rows = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(and(eq(providerProfiles.id, providerProfileId), gte(providerProfiles.updatedAt, since)))
		.limit(1);
	return rows.length > 0;
}
