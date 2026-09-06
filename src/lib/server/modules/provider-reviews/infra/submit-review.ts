import type { Database } from '../../../db';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { hasEligibleThread } from '../../direct-messaging/infra/thread-eligibility';
import { getProfileOwnerIdDb } from '../../provider-profile';
import { createReview, REVIEW_MIN_AGE_HOURS } from '../domain/review';
import { getReviewEligibility } from './review-eligibility';
import { seekerHasReviewForProvider } from './review-queries';
import { recomputeRatingAggregate } from './rating-aggregate';
import { reviews } from './schema';
import { toOwnReview, type OwnReviewDto } from './serializers';

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: string }).code === '23505'
	);
}

export async function submitReview(
	db: Database,
	input: {
		seekerId: UserId;
		providerProfileId: ProviderProfileId;
		rating: number;
		body?: string | null;
		now: Date;
		correlationId: string;
	}
): Promise<Result<OwnReviewDto, UseCaseError>> {
	const ownerId = await getProfileOwnerIdDb(db, input.providerProfileId);
	if (!ownerId) {
		return Err({ kind: 'not_found', resource: 'provider_profile' });
	}

	const alreadyReviewed = await seekerHasReviewForProvider(
		db,
		input.seekerId,
		input.providerProfileId
	);
	if (alreadyReviewed) {
		return Err({ kind: 'conflict', reason: 'REVIEW_ALREADY_EXISTS' });
	}

	const eligibility = await getReviewEligibility(
		db,
		input.seekerId,
		input.providerProfileId,
		input.now
	);
	if (!eligibility.eligible) {
		return Err({ kind: 'precondition_failed', reason: 'REVIEW_INELIGIBLE' });
	}

	const eligibleThread = await hasEligibleThread(
		db,
		input.seekerId,
		input.providerProfileId,
		REVIEW_MIN_AGE_HOURS,
		input.now
	);
	if (!eligibleThread) {
		return Err({ kind: 'precondition_failed', reason: 'REVIEW_INELIGIBLE' });
	}

	const draft = createReview({
		rating: input.rating,
		...(input.body !== undefined ? { body: input.body } : {})
	});
	if (!draft.ok) {
		return Err({ kind: 'validation_failed', issues: draft.issues });
	}

	const reviewId = newId<'ReviewId'>();

	try {
		const dto = await db.transaction(async (tx) => {
			await tx.insert(reviews).values({
				id: reviewId,
				providerProfileId: input.providerProfileId,
				reviewerId: input.seekerId,
				rating: draft.value.rating,
				body: draft.value.body,
				createdAt: input.now
			});

			await recomputeRatingAggregate(tx, input.providerProfileId, input.correlationId, input.now);

			const submitted: DomainEvent<
				'ReviewSubmitted',
				{ reviewId: string; providerProfileId: string; rating: number }
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'ReviewSubmitted',
				version: 1,
				occurredAt: asInstant(input.now.toISOString()),
				correlationId: input.correlationId,
				payload: {
					reviewId,
					providerProfileId: input.providerProfileId,
					rating: draft.value.rating
				}
			};
			await publish(tx, submitted);

			return toOwnReview({
				id: reviewId,
				providerProfileId: input.providerProfileId,
				rating: draft.value.rating,
				body: draft.value.body,
				isEdited: false,
				createdAt: input.now
			});
		});

		return Ok(dto);
	} catch (error) {
		if (isUniqueViolation(error)) {
			return Err({ kind: 'conflict', reason: 'REVIEW_ALREADY_EXISTS' });
		}
		throw error;
	}
}
