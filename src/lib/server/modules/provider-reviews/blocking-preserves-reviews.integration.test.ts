import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedBlocking,
	SEED_SAFE02_REVIEW_BODY,
	SEED_SAFE02_REVIEW_ID,
	SEED_SAFE02_SEEKER_ID
} from '../../../../../scripts/seed-blocking';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { EVENT_SUBSCRIBERS } from '../../shared/event-catalog';
import { blockUser } from '../trust-and-safety';
import { canSeekerMessageProvider } from '../direct-messaging';
import {
	getSeekerReviewForProvider,
	listPublicReviewsForProvider,
	listReviewsWrittenBySeeker
} from './index';
import { ratingAggregate, reviews } from './infra/schema';

describe('US-REV-06 blocking does not rewrite history', () => {
	it('FR-REV-07: UserBlocked has no provider-reviews subscriber', () => {
		const subscribers = EVENT_SUBSCRIBERS.UserBlocked;
		expect(subscribers).not.toContain('provider-reviews.moderation-effect');
		expect(subscribers.some((name) => name.startsWith('provider-reviews'))).toBe(false);
	});

	it('TC-REV-06a: existing reviews survive a block in both directions', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedBlocking(db);

			const seekerId = asId<'UserId'>(SEED_SAFE02_SEEKER_ID);
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const reviewId = asId<'ReviewId'>(SEED_SAFE02_REVIEW_ID);
			const now = new Date('2026-09-05T14:00:00Z');

			const beforeRows = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(beforeRows).toHaveLength(1);
			expect(beforeRows[0]?.body).toBe(SEED_SAFE02_REVIEW_BODY);

			const beforeAggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(beforeAggregate.length).toBeGreaterThanOrEqual(0);

			const blocked = await blockUser(db, {
				blockerId: seekerId,
				blockedId: providerOwnerId,
				now,
				correlationId: 'corr-rev-06a'
			});
			expect(blocked.ok).toBe(true);

			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(false);

			const afterRows = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(afterRows).toHaveLength(1);
			expect(afterRows[0]?.body).toBe(SEED_SAFE02_REVIEW_BODY);
			expect(afterRows[0]?.rating).toBe(5);

			const publicListed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			expect(publicListed.reviews.some((review) => review.id === reviewId)).toBe(true);
			expect(publicListed.reviews.find((review) => review.id === reviewId)?.body).toBe(
				SEED_SAFE02_REVIEW_BODY
			);

			const seekerOwn = await getSeekerReviewForProvider(db, seekerId, providerProfileId);
			expect(seekerOwn?.id).toBe(reviewId);
			expect(seekerOwn?.body).toBe(SEED_SAFE02_REVIEW_BODY);

			const seekerWritten = await listReviewsWrittenBySeeker(db, seekerId);
			expect(seekerWritten.some((review) => review.id === reviewId)).toBe(true);

			const afterAggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			if (beforeAggregate[0] && afterAggregate[0]) {
				expect(afterAggregate[0].count).toBe(beforeAggregate[0].count);
				expect(afterAggregate[0].average).toBe(beforeAggregate[0].average);
			}
		});
	});

	it('TC-REV-06a: provider-initiated block also leaves reviews untouched', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedBlocking(db);

			const seekerId = asId<'UserId'>(SEED_SAFE02_SEEKER_ID);
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const reviewId = asId<'ReviewId'>(SEED_SAFE02_REVIEW_ID);
			const now = new Date('2026-09-05T15:00:00Z');

			const beforeAggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));

			const blocked = await blockUser(db, {
				blockerId: providerOwnerId,
				blockedId: seekerId,
				now,
				correlationId: 'corr-rev-06a-provider'
			});
			expect(blocked.ok).toBe(true);

			expect(await canSeekerMessageProvider(db, seekerId, providerProfileId)).toBe(false);

			const afterRows = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(afterRows).toHaveLength(1);
			expect(afterRows[0]?.body).toBe(SEED_SAFE02_REVIEW_BODY);

			const publicListed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			expect(publicListed.reviews.some((review) => review.id === reviewId)).toBe(true);
			expect(publicListed.reviews.find((review) => review.id === reviewId)?.body).toBe(
				SEED_SAFE02_REVIEW_BODY
			);

			const seekerOwn = await getSeekerReviewForProvider(db, seekerId, providerProfileId);
			expect(seekerOwn?.id).toBe(reviewId);
			expect(seekerOwn?.body).toBe(SEED_SAFE02_REVIEW_BODY);

			const seekerWritten = await listReviewsWrittenBySeeker(db, seekerId);
			expect(seekerWritten.some((review) => review.id === reviewId)).toBe(true);

			const afterAggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			if (beforeAggregate[0] && afterAggregate[0]) {
				expect(afterAggregate[0].count).toBe(beforeAggregate[0].count);
				expect(afterAggregate[0].average).toBe(beforeAggregate[0].average);
			}
		});
	});
});
