import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedReviews,
	SEED_REV_ELIGIBLE_SEEKER_ID,
	SEED_REV_PROVIDER_PROFILE_ID
} from '../../../../../scripts/seed-reviews';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { asId, newId } from '../../shared/ids';
import { handleReviewsModeration, listPublicReviewsForProvider, submitReview } from './index';
import { ratingAggregate, reviews } from './infra/schema';

describe('US-REV-02 admin removal via ModerationActionTaken', () => {
	it('hard-deletes review and recomputes aggregate on remove_review', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T11:00:00Z');
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const submitted = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 5,
				body: 'Admin removal target.',
				now,
				correlationId: 'corr-rev-mod'
			});
			expect(submitted.ok).toBe(true);
			if (!submitted.ok) return;

			const event: DomainEvent<
				'ModerationActionTaken',
				{
					moderationActionId: string;
					targetType: string;
					targetId: string;
					action: string;
					reason?: string;
					metadata?: { part?: string };
				}
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId: 'corr-rev-mod-effect',
				payload: {
					moderationActionId: newId(),
					targetType: 'review',
					targetId: submitted.value.id,
					action: 'remove_review',
					reason: 'Policy violation confirmed.'
				}
			};

			await handleReviewsModeration(db, event);

			const row = await db.select().from(reviews).where(eq(reviews.id, submitted.value.id));
			expect(row).toHaveLength(0);

			const aggregateRows = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(aggregateRows[0]?.count).toBe(1);
			expect(Number(aggregateRows[0]?.average)).toBe(4);

			const listed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			expect(listed.reviews.some((review) => review.id === submitted.value.id)).toBe(false);
		});
	});

	it('nulls reply only when metadata.part is reply', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T11:30:00Z');
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const submitted = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 3,
				body: 'Review with reply.',
				now,
				correlationId: 'corr-rev-reply'
			});
			expect(submitted.ok).toBe(true);
			if (!submitted.ok) return;

			await db
				.update(reviews)
				.set({ replyBody: 'Provider response.', repliedAt: now })
				.where(eq(reviews.id, submitted.value.id));

			const event: DomainEvent<
				'ModerationActionTaken',
				{
					moderationActionId: string;
					targetType: string;
					targetId: string;
					action: string;
					metadata?: { part?: string };
				}
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId: 'corr-rev-reply-effect',
				payload: {
					moderationActionId: newId(),
					targetType: 'review',
					targetId: submitted.value.id,
					action: 'remove_review',
					metadata: { part: 'reply' }
				}
			};

			await handleReviewsModeration(db, event);

			const row = await db.select().from(reviews).where(eq(reviews.id, submitted.value.id));
			expect(row).toHaveLength(1);
			expect(row[0]?.replyBody).toBeNull();
			expect(row[0]?.body).toBe('Review with reply.');

			const aggregateRows = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(aggregateRows[0]?.count).toBe(2);
		});
	});

	it('ignores duplicate ModerationActionTaken delivery', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T12:00:00Z');
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const submitted = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 2,
				body: 'Idempotent removal.',
				now,
				correlationId: 'corr-rev-idem'
			});
			expect(submitted.ok).toBe(true);
			if (!submitted.ok) return;

			const event: DomainEvent<
				'ModerationActionTaken',
				{
					moderationActionId: string;
					targetType: string;
					targetId: string;
					action: string;
				}
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId: 'corr-rev-idem-effect',
				payload: {
					moderationActionId: newId(),
					targetType: 'review',
					targetId: submitted.value.id,
					action: 'remove_review'
				}
			};

			await handleReviewsModeration(db, event);
			await handleReviewsModeration(db, event);

			const aggregateRows = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(aggregateRows[0]?.count).toBe(1);
		});
	});
});
