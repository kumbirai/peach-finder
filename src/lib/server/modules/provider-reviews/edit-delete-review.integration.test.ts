import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedReviews,
	SEED_REV_EXISTING_REVIEW_ID,
	SEED_REV_EXISTING_SEEKER_ID,
	SEED_REV_PROVIDER_PROFILE_ID
} from '../../../../../scripts/seed-reviews';
import { asId } from '../../shared/ids';
import { deleteReview, editReview, listPublicReviewsForProvider } from './index';
import { ratingAggregate, reviews } from './infra/schema';

describe('US-REV-03 change my mind', () => {
	it('TC-REV-03a: edit updates aggregate and marks review edited', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_EXISTING_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);

			const beforeAggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(beforeAggregate[0]?.count).toBe(1);

			const edited = await editReview(db, {
				reviewId,
				seekerId,
				rating: 5,
				body: 'Updated after more thought.',
				now,
				correlationId: 'corr-rev-03a'
			});
			expect(edited.ok).toBe(true);
			if (edited.ok) {
				expect(edited.value.isEdited).toBe(true);
				expect(edited.value.rating).toBe(5);
			}

			const row = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(row[0]?.isEdited).toBe(true);
			expect(row[0]?.rating).toBe(5);

			const aggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(aggregate[0]?.count).toBe(1);
			expect(Number(aggregate[0]?.average)).toBe(5);

			const listed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			const publicReview = listed.reviews.find((review) => review.id === reviewId);
			expect(publicReview?.isEdited).toBe(true);
			expect(publicReview?.body).toBe('Updated after more thought.');
		});
	});

	it('TC-REV-03b: delete removes review and recomputes aggregate', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_EXISTING_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);

			const deleted = await deleteReview(db, {
				reviewId,
				seekerId,
				now,
				correlationId: 'corr-rev-03b'
			});
			expect(deleted.ok).toBe(true);

			const row = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(row).toHaveLength(0);

			const aggregate = await db
				.select()
				.from(ratingAggregate)
				.where(eq(ratingAggregate.providerProfileId, providerProfileId));
			expect(aggregate[0]?.count).toBe(0);
			expect(aggregate[0]?.average).toBeNull();

			const listed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			expect(listed.reviews.some((review) => review.id === reviewId)).toBe(false);
		});
	});

	it('returns not_found when deleting an already-deleted review', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_EXISTING_SEEKER_ID);
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);

			const first = await deleteReview(db, {
				reviewId,
				seekerId,
				now,
				correlationId: 'corr-rev-03-double-delete'
			});
			expect(first.ok).toBe(true);

			const second = await deleteReview(db, {
				reviewId,
				seekerId,
				now,
				correlationId: 'corr-rev-03-double-delete-2'
			});
			expect(second.ok).toBe(false);
			if (!second.ok) {
				expect(second.error).toEqual({ kind: 'not_found', resource: 'review' });
			}
		});
	});

	it('rejects edit and delete from non-owner', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const otherSeeker = asId<'UserId'>('01900000-0000-7000-8000-00000000d102');
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);

			const edited = await editReview(db, {
				reviewId,
				seekerId: otherSeeker,
				rating: 1,
				now,
				correlationId: 'corr-rev-03-forbidden-edit'
			});
			expect(edited.ok).toBe(false);
			if (!edited.ok) {
				expect(edited.error).toEqual({ kind: 'forbidden', reason: 'not_owner' });
			}

			const deleted = await deleteReview(db, {
				reviewId,
				seekerId: otherSeeker,
				now,
				correlationId: 'corr-rev-03-forbidden-delete'
			});
			expect(deleted.ok).toBe(false);
			if (!deleted.ok) {
				expect(deleted.error).toEqual({ kind: 'forbidden', reason: 'not_owner' });
			}
		});
	});
});
