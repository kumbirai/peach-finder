import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedReviews,
	SEED_REV_ELIGIBLE_SEEKER_ID,
	SEED_REV_EXISTING_REVIEW_ID,
	SEED_REV_EXISTING_SEEKER_ID,
	SEED_REV_PROVIDER_PROFILE_ID
} from '../../../../../scripts/seed-reviews';
import { asId } from '../../shared/ids';
import { fileReport } from '../trust-and-safety';
import { listPublicReviewsForProvider, submitReview } from './index';
import { ratingAggregate, reviews } from './infra/schema';

describe('US-REV-02 live immediately, human-removable only', () => {
	it('TC-REV-02a: provocative text publishes immediately with no moderation gate', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);
			const body = 'spam scam offensive — no automated screening should block this.';

			const submitted = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 1,
				body,
				now,
				correlationId: 'corr-rev-02a'
			});
			expect(submitted.ok).toBe(true);

			const listed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			expect(listed.reviews.some((review) => review.body === body)).toBe(true);

			const rows = await db.select().from(reviews).where(eq(reviews.reviewerId, seekerId));
			expect(rows).toHaveLength(1);
			expect(rows[0]?.body).toBe(body);
			expect(Object.keys(rows[0] ?? {})).not.toContain('status');
			expect(Object.keys(rows[0] ?? {})).not.toContain('hidden');
		});
	});

	it('TC-REV-02b: rating aggregate matches review rows atomically after submit', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const submitted = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 5,
				body: 'Atomic aggregate check.',
				now,
				correlationId: 'corr-rev-02b'
			});
			expect(submitted.ok).toBe(true);

			const reviewRows = await db
				.select({ rating: reviews.rating })
				.from(reviews)
				.where(eq(reviews.providerProfileId, providerProfileId));
			const aggregateRows = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));

			expect(reviewRows).toHaveLength(2);
			expect(aggregateRows).toHaveLength(1);
			expect(aggregateRows[0]?.count).toBe(2);
			expect(Number(aggregateRows[0]?.average)).toBe(4.5);
		});
	});

	it('TC-REV-02c: filing reports does not remove or hide the review', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T10:00:00Z');
			const reviewId = SEED_REV_EXISTING_REVIEW_ID;
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);
			const reporterIds = [
				asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID),
				asId<'UserId'>(SEED_REV_EXISTING_SEEKER_ID)
			];

			for (const [index, reporterId] of reporterIds.entries()) {
				const filed = await fileReport(db, {
					reporterId,
					targetType: 'review',
					targetId: reviewId,
					reason: 'spam_scam',
					freeText: 'Automated removal must not trigger.',
					now: new Date(now.getTime() + index * 1000),
					correlationId: `corr-rev-02c-${index}`
				});
				expect(filed.ok).toBe(true);
			}

			const row = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(row).toHaveLength(1);

			const listed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			expect(listed.reviews.some((review) => review.id === reviewId)).toBe(true);
		});
	});
});
