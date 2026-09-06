import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedReviews,
	SEED_REV_EXISTING_REVIEW_ID,
	SEED_REV_PROVIDER_OWNER_ID,
	SEED_REV_PROVIDER_PROFILE_ID
} from '../../../../../scripts/seed-reviews';
import { asId } from '../../shared/ids';
import { editReviewReply, listPublicReviewsForProvider, replyToReview } from './index';
import { reviews } from './infra/schema';

describe('US-REV-05 provider right of reply', () => {
	it('TC-REV-05a: provider posts one reply and duplicate is rejected', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T12:00:00Z');
			const providerOwnerId = asId<'UserId'>(SEED_REV_PROVIDER_OWNER_ID);
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const first = await replyToReview(db, {
				reviewId,
				providerOwnerId,
				body: 'Thanks for visiting — glad the session helped.',
				now,
				correlationId: 'corr-rev-05a'
			});
			expect(first.ok).toBe(true);
			if (first.ok) {
				expect(first.value.providerReply).toEqual({
					body: 'Thanks for visiting — glad the session helped.'
				});
			}

			const row = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(row[0]?.replyBody).toBe('Thanks for visiting — glad the session helped.');

			const duplicate = await replyToReview(db, {
				reviewId,
				providerOwnerId,
				body: 'Second attempt.',
				now,
				correlationId: 'corr-rev-05a-dup'
			});
			expect(duplicate.ok).toBe(false);
			if (!duplicate.ok) {
				expect(duplicate.error).toEqual({ kind: 'conflict', reason: 'REPLY_ALREADY_EXISTS' });
			}

			const listed = await listPublicReviewsForProvider(db, providerProfileId, { limit: 20 });
			const target = listed.reviews.find((review) => review.id === reviewId);
			expect(target?.providerReply?.body).toBe('Thanks for visiting — glad the session helped.');
		});
	});

	it('rejects reply from non-owner provider', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const result = await replyToReview(db, {
				reviewId: asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID),
				providerOwnerId: asId<'UserId'>('01900000-0000-7000-8000-000000000004'),
				body: 'Not my review.',
				now: new Date(),
				correlationId: 'corr-rev-05-forbidden'
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toEqual({ kind: 'forbidden', reason: 'not_owner' });
			}
		});
	});

	it('rejects whitespace-only reply bodies', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const result = await replyToReview(db, {
				reviewId: asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID),
				providerOwnerId: asId<'UserId'>(SEED_REV_PROVIDER_OWNER_ID),
				body: '   ',
				now: new Date(),
				correlationId: 'corr-rev-05-blank'
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toEqual({
					kind: 'validation_failed',
					issues: [{ path: 'body', message: 'Write a short reply before publishing.' }]
				});
			}
		});
	});

	it('returns not_found for a missing review id', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const result = await replyToReview(db, {
				reviewId: asId<'ReviewId'>('01900000-0000-7000-8000-00000000d399'),
				providerOwnerId: asId<'UserId'>(SEED_REV_PROVIDER_OWNER_ID),
				body: 'Reply to nothing.',
				now: new Date(),
				correlationId: 'corr-rev-05-missing'
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toEqual({ kind: 'not_found', resource: 'review' });
			}
		});
	});

	it('allows only one concurrent reply to win', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T12:00:00Z');
			const providerOwnerId = asId<'UserId'>(SEED_REV_PROVIDER_OWNER_ID);
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);

			const [first, second] = await Promise.all([
				replyToReview(db, {
					reviewId,
					providerOwnerId,
					body: 'First concurrent reply.',
					now,
					correlationId: 'corr-rev-05-race-a'
				}),
				replyToReview(db, {
					reviewId,
					providerOwnerId,
					body: 'Second concurrent reply.',
					now,
					correlationId: 'corr-rev-05-race-b'
				})
			]);

			const outcomes = [first, second];
			expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
			expect(outcomes.filter((result) => !result.ok)).toHaveLength(1);
			const loser = outcomes.find((result) => !result.ok);
			expect(loser?.ok).toBe(false);
			if (loser && !loser.ok) {
				expect(loser.error).toEqual({ kind: 'conflict', reason: 'REPLY_ALREADY_EXISTS' });
			}

			const row = await db.select().from(reviews).where(eq(reviews.id, reviewId));
			expect(row[0]?.replyBody).toMatch(/concurrent reply\./);
		});
	});

	it('allows provider to edit an existing reply', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date('2026-09-06T12:30:00Z');
			const providerOwnerId = asId<'UserId'>(SEED_REV_PROVIDER_OWNER_ID);
			const reviewId = asId<'ReviewId'>(SEED_REV_EXISTING_REVIEW_ID);

			const created = await replyToReview(db, {
				reviewId,
				providerOwnerId,
				body: 'Initial reply.',
				now,
				correlationId: 'corr-rev-05-edit'
			});
			expect(created.ok).toBe(true);

			const edited = await editReviewReply(db, {
				reviewId,
				providerOwnerId,
				body: 'Updated reply after reflection.',
				now
			});
			expect(edited.ok).toBe(true);
			if (edited.ok) {
				expect(edited.value.providerReply?.body).toBe('Updated reply after reflection.');
			}
		});
	});
});
