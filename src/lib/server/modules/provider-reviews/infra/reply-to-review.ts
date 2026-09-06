import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../../db';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId, asId, type ReviewId, type UserId } from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getProfileOwnerIdDb } from '../../provider-profile';
import { validateReplyBody } from '../domain/review';
import { reviews } from './schema';
import { toOwnReview, type OwnReviewDto } from './serializers';

async function loadReviewForProvider(
	db: Database,
	reviewId: ReviewId,
	providerOwnerId: UserId
): Promise<
	| {
			id: string;
			providerProfileId: string;
			rating: number;
			body: string | null;
			isEdited: boolean;
			replyBody: string | null;
			createdAt: Date;
	  }
	| { error: UseCaseError }
> {
	const rows = await db
		.select({
			id: reviews.id,
			providerProfileId: reviews.providerProfileId,
			rating: reviews.rating,
			body: reviews.body,
			isEdited: reviews.isEdited,
			replyBody: reviews.replyBody,
			createdAt: reviews.createdAt
		})
		.from(reviews)
		.where(eq(reviews.id, reviewId))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return { error: { kind: 'not_found', resource: 'review' } };
	}

	const ownerId = await getProfileOwnerIdDb(db, asId<'ProviderProfileId'>(row.providerProfileId));
	if (!ownerId || ownerId !== providerOwnerId) {
		return { error: { kind: 'forbidden', reason: 'not_owner' } };
	}

	return row;
}

export async function replyToReview(
	db: Database,
	input: {
		reviewId: ReviewId;
		providerOwnerId: UserId;
		body: string;
		now: Date;
		correlationId: string;
	}
): Promise<Result<OwnReviewDto, UseCaseError>> {
	const loaded = await loadReviewForProvider(db, input.reviewId, input.providerOwnerId);
	if ('error' in loaded) {
		return Err(loaded.error);
	}

	if (loaded.replyBody) {
		return Err({ kind: 'conflict', reason: 'REPLY_ALREADY_EXISTS' });
	}

	const draft = validateReplyBody(input.body);
	if (!draft.ok) {
		return Err({ kind: 'validation_failed', issues: draft.issues });
	}

	const dto = await db.transaction(async (tx) => {
		const updated = await tx
			.update(reviews)
			.set({
				replyBody: draft.value,
				repliedAt: input.now
			})
			.where(
				and(
					eq(reviews.id, input.reviewId),
					eq(reviews.providerProfileId, loaded.providerProfileId),
					isNull(reviews.replyBody)
				)
			)
			.returning({ id: reviews.id });

		if (updated.length === 0) {
			return null;
		}

		const replied: DomainEvent<'ReviewReplied', { reviewId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'ReviewReplied',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: { reviewId: input.reviewId }
		};
		await publish(tx, replied);

		return toOwnReview({
			id: loaded.id,
			providerProfileId: loaded.providerProfileId,
			rating: loaded.rating,
			body: loaded.body,
			isEdited: loaded.isEdited,
			createdAt: loaded.createdAt,
			replyBody: draft.value
		});
	});

	if (dto === null) {
		return Err({ kind: 'conflict', reason: 'REPLY_ALREADY_EXISTS' });
	}

	return Ok(dto);
}

export async function editReviewReply(
	db: Database,
	input: {
		reviewId: ReviewId;
		providerOwnerId: UserId;
		body: string;
		now: Date;
	}
): Promise<Result<OwnReviewDto, UseCaseError>> {
	const loaded = await loadReviewForProvider(db, input.reviewId, input.providerOwnerId);
	if ('error' in loaded) {
		return Err(loaded.error);
	}

	if (!loaded.replyBody) {
		return Err({ kind: 'not_found', resource: 'review_reply' });
	}

	const draft = validateReplyBody(input.body);
	if (!draft.ok) {
		return Err({ kind: 'validation_failed', issues: draft.issues });
	}

	await db
		.update(reviews)
		.set({
			replyBody: draft.value,
			repliedAt: input.now
		})
		.where(
			and(eq(reviews.id, input.reviewId), eq(reviews.providerProfileId, loaded.providerProfileId))
		);

	return Ok(
		toOwnReview({
			id: loaded.id,
			providerProfileId: loaded.providerProfileId,
			rating: loaded.rating,
			body: loaded.body,
			isEdited: loaded.isEdited,
			createdAt: loaded.createdAt,
			replyBody: draft.value
		})
	);
}
