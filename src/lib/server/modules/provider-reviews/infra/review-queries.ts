import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { reviews } from './schema';

export async function seekerHasReviewForProvider(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId
): Promise<boolean> {
	const rows = await db
		.select({ id: reviews.id })
		.from(reviews)
		.where(and(eq(reviews.reviewerId, seekerId), eq(reviews.providerProfileId, providerProfileId)))
		.limit(1);
	return rows.length > 0;
}
