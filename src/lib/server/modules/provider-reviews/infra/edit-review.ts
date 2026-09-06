import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ReviewId, UserId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { editReview as editReviewDraft } from '../domain/review';
import { recomputeRatingAggregate } from './rating-aggregate';
import { reviews } from './schema';
import { toOwnReview, type OwnReviewDto } from './serializers';

export async function editReview(
	db: Database,
	input: {
		reviewId: ReviewId;
		seekerId: UserId;
		rating?: number;
		body?: string | null;
		now: Date;
		correlationId: string;
	}
): Promise<Result<OwnReviewDto, UseCaseError>> {
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
		.where(eq(reviews.id, input.reviewId))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return Err({ kind: 'not_found', resource: 'review' });
	}

	if (row.reviewerId !== input.seekerId) {
		return Err({ kind: 'forbidden', reason: 'not_owner' });
	}

	const draft = editReviewDraft(
		{ rating: row.rating, body: row.body },
		{
			...(input.rating !== undefined ? { rating: input.rating } : {}),
			...(input.body !== undefined ? { body: input.body } : {})
		}
	);
	if (!draft.ok) {
		return Err({ kind: 'validation_failed', issues: draft.issues });
	}

	const dto = await db.transaction(async (tx) => {
		await tx
			.update(reviews)
			.set({
				rating: draft.value.rating,
				body: draft.value.body,
				isEdited: true,
				editedAt: input.now
			})
			.where(and(eq(reviews.id, input.reviewId), eq(reviews.reviewerId, input.seekerId)));

		await recomputeRatingAggregate(
			tx,
			asId<'ProviderProfileId'>(row.providerProfileId),
			input.correlationId,
			input.now
		);

		return toOwnReview({
			id: row.id,
			providerProfileId: row.providerProfileId,
			rating: draft.value.rating,
			body: draft.value.body,
			isEdited: true,
			createdAt: row.createdAt
		});
	});

	return Ok(dto);
}
