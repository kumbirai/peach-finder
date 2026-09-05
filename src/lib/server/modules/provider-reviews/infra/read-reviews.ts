import { eq, desc } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { getProfileOwnerDisplayName } from '../../provider-profile';
import { reviews } from './schema';

export type SeekerReviewSummary = {
	id: string;
	providerName: string;
	rating: number;
	body: string;
};

export async function listReviewsWrittenBySeeker(
	db: Database,
	reviewerId: UserId
): Promise<SeekerReviewSummary[]> {
	const rows = await db
		.select({
			id: reviews.id,
			providerProfileId: reviews.providerProfileId,
			rating: reviews.rating,
			body: reviews.body
		})
		.from(reviews)
		.where(eq(reviews.reviewerId, reviewerId))
		.orderBy(desc(reviews.createdAt));

	const summaries: SeekerReviewSummary[] = [];
	for (const row of rows) {
		const providerName = await getProfileOwnerDisplayName(
			db,
			row.providerProfileId as ProviderProfileId
		);
		summaries.push({
			id: row.id,
			providerName,
			rating: row.rating,
			body: row.body ?? ''
		});
	}
	return summaries;
}

export async function countReviewsOnProfile(
	db: Database,
	providerProfileId: string
): Promise<number> {
	const rows = await db
		.select({ id: reviews.id })
		.from(reviews)
		.where(eq(reviews.providerProfileId, providerProfileId));
	return rows.length;
}
