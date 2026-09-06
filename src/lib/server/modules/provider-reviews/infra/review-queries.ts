import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, ReviewId, UserId } from '../../../shared/ids';
import { toOwnReview, type OwnReviewDto } from './serializers';
import { reviews } from './schema';

export async function getReviewById(
	db: Database,
	reviewId: ReviewId
): Promise<{
	id: string;
	providerProfileId: string;
	reviewerId: string;
	rating: number;
	body: string | null;
	isEdited: boolean;
	createdAt: Date;
} | null> {
	const rows = await db
		.select({
			id: reviews.id,
			providerProfileId: reviews.providerProfileId,
			reviewerId: reviews.reviewerId,
			rating: reviews.rating,
			body: reviews.body,
			isEdited: reviews.isEdited,
			createdAt: reviews.createdAt
		})
		.from(reviews)
		.where(eq(reviews.id, reviewId))
		.limit(1);

	return rows[0] ?? null;
}

export async function getSeekerReviewForProvider(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId
): Promise<OwnReviewDto | null> {
	const rows = await db
		.select({
			id: reviews.id,
			providerProfileId: reviews.providerProfileId,
			rating: reviews.rating,
			body: reviews.body,
			isEdited: reviews.isEdited,
			createdAt: reviews.createdAt
		})
		.from(reviews)
		.where(and(eq(reviews.reviewerId, seekerId), eq(reviews.providerProfileId, providerProfileId)))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	return toOwnReview(row);
}

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
