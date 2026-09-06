import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import { type ReviewId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { recomputeRatingAggregate } from './rating-aggregate';
import { reviews } from './schema';

export async function handleModerationActionTaken(
	db: Database,
	event: DomainEvent<
		'ModerationActionTaken',
		{
			moderationActionId: string;
			targetType: string;
			targetId: string;
			action: string;
			reason?: string;
			metadata?: { part?: string };
		}
	>
): Promise<void> {
	if (event.payload.action !== 'remove_review' || event.payload.targetType !== 'review') {
		return;
	}

	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'provider-reviews.moderation-effect');
		if (!inserted) return;

		const now = new Date(event.occurredAt);
		const reviewId = event.payload.targetId as ReviewId;
		const rows = await tx
			.select({
				providerProfileId: reviews.providerProfileId,
				replyBody: reviews.replyBody
			})
			.from(reviews)
			.where(eq(reviews.id, reviewId))
			.limit(1);
		const row = rows[0];
		if (!row) return;

		if (event.payload.metadata?.part === 'reply') {
			if (!row.replyBody) return;
			await tx
				.update(reviews)
				.set({ replyBody: null, repliedAt: null })
				.where(eq(reviews.id, reviewId));
			return;
		}

		await tx.delete(reviews).where(eq(reviews.id, reviewId));
		await recomputeRatingAggregate(tx, row.providerProfileId as never, event.correlationId, now);
	});
}
