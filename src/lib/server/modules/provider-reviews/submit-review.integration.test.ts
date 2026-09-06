import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedReviews,
	SEED_REV_ELIGIBLE_SEEKER_ID,
	SEED_REV_INELIGIBLE_SEEKER_ID,
	SEED_REV_PROVIDER_PROFILE_ID,
	SEED_REV_EXISTING_SEEKER_ID,
	SEED_REV_INELIGIBLE_REASON
} from '../../../../../scripts/seed-reviews';
import { asId } from '../../shared/ids';
import { getReviewEligibilityDto, submitReview } from './index';
import { REVIEW_CONTACT_DAY_REASON } from './domain/eligibility';

describe('US-REV-01 leave a review that counts', () => {
	it('TC-REV-01b: ineligible seeker gets plain-language eligibility reason', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const eligibility = await getReviewEligibilityDto(
				db,
				asId<'UserId'>(SEED_REV_INELIGIBLE_SEEKER_ID),
				asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID),
				now
			);

			expect(eligibility.eligible).toBe(false);
			expect(eligibility.reason).toBe(SEED_REV_INELIGIBLE_REASON);
			expect(eligibility.reason).toBe(REVIEW_CONTACT_DAY_REASON);
		});
	});

	it('TC-REV-01a/01c: eligible seeker can submit once; second submit conflicts', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const eligibility = await getReviewEligibilityDto(db, seekerId, providerProfileId, now);
			expect(eligibility.eligible).toBe(true);

			const first = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 5,
				body: 'Wonderful experience.',
				now,
				correlationId: 'corr-rev-01'
			});
			expect(first.ok).toBe(true);

			const second = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 4,
				body: 'Trying again.',
				now,
				correlationId: 'corr-rev-02'
			});
			expect(second.ok).toBe(false);
			if (!second.ok) {
				expect(second.error).toEqual({ kind: 'conflict', reason: 'REVIEW_ALREADY_EXISTS' });
			}
		});
	});

	it('seedReviews resets submitted reviews for idempotent E2E reruns', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const now = new Date();
			const seekerId = asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID);
			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);

			const first = await submitReview(db, {
				seekerId,
				providerProfileId,
				rating: 5,
				body: 'Wonderful experience.',
				now,
				correlationId: 'corr-rev-reseed'
			});
			expect(first.ok).toBe(true);

			const blocked = await getReviewEligibilityDto(db, seekerId, providerProfileId, now);
			expect(blocked.eligible).toBe(false);

			await seedReviews(db);

			const eligibility = await getReviewEligibilityDto(db, seekerId, providerProfileId, now);
			expect(eligibility.eligible).toBe(true);
		});
	});

	it('TC-REV-01c: existing review blocks eligibility before submit', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const eligibility = await getReviewEligibilityDto(
				db,
				asId<'UserId'>(SEED_REV_EXISTING_SEEKER_ID),
				asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID),
				new Date()
			);

			expect(eligibility.eligible).toBe(false);
			expect(eligibility.reason).toContain('already reviewed');
		});
	});
});
