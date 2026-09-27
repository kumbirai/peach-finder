import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { ratingAggregate } from './schema';

export type RatingAggregateSnapshot = {
	average: string | null;
	count: number;
};

export async function getRatingAggregate(
	db: Database | Transaction,
	providerProfileId: ProviderProfileId
): Promise<RatingAggregateSnapshot> {
	const rows = await db
		.select({
			average: ratingAggregate.average,
			count: ratingAggregate.count
		})
		.from(ratingAggregate)
		.where(eq(ratingAggregate.providerProfileId, providerProfileId))
		.limit(1);

	const row = rows[0];
	return {
		average: row?.average ?? null,
		count: row?.count ?? 0
	};
}
