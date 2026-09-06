import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { threads } from './schema';

const MS_PER_HOUR = 60 * 60 * 1000;

export async function getThreadCreatedAtForPair(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId
): Promise<Date | null> {
	const rows = await db
		.select({ createdAt: threads.createdAt })
		.from(threads)
		.where(and(eq(threads.seekerId, seekerId), eq(threads.providerProfileId, providerProfileId)))
		.limit(1);
	return rows[0]?.createdAt ?? null;
}

export async function hasEligibleThread(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId,
	minAgeHours: number,
	now: Date
): Promise<boolean> {
	const createdAt = await getThreadCreatedAtForPair(db, seekerId, providerProfileId);
	if (!createdAt) return false;
	const ageMs = now.getTime() - createdAt.getTime();
	return ageMs >= minAgeHours * MS_PER_HOUR;
}
