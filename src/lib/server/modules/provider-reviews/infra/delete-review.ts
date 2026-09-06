import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ReviewId, UserId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { recomputeRatingAggregate } from './rating-aggregate';
import { reviews } from './schema';

export async function deleteReview(
	db: Database,
	input: {
		reviewId: ReviewId;
		seekerId: UserId;
		now: Date;
		correlationId: string;
	}
): Promise<Result<{ deleted: true }, UseCaseError>> {
	const rows = await db
		.select({
			id: reviews.id,
			providerProfileId: reviews.providerProfileId,
			reviewerId: reviews.reviewerId
		})
		.from(reviews)
		.where(eq(reviews.id, input.reviewId))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return Err({ kind: 'not_found', resource: 'review' });
	}

	if (row.reviewerId !== input.seekerId) {
		return Err({ kind: 'forbidden', reason: 'not_owner' });
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(reviews)
			.where(and(eq(reviews.id, input.reviewId), eq(reviews.reviewerId, input.seekerId)));

		await recomputeRatingAggregate(
			tx,
			asId<'ProviderProfileId'>(row.providerProfileId),
			input.correlationId,
			input.now
		);
	});

	return Ok({ deleted: true });
}
