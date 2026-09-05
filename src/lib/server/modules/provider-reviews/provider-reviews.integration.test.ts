import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_VIEW_05_EDITED_REVIEW_BODY,
	SEED_VIEW_05_NEWEST_REVIEWER_LABEL,
	SEED_VIEW_05_REPLY_BODY,
	SEED_VIEW_05_REVIEW_COUNT
} from '../../../../../scripts/seed-core';
import { encodeCursor } from '../../shared/api';
import { listPublicReviewsForProvider } from './infra/list-public-reviews';
import { asId } from '../../shared/ids';

describe('US-VIEW-05 provider-reviews integration', () => {
	it('TC-VIEW-05a: lists reviews newest-first with privacy-safe fields', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const firstPage = await listPublicReviewsForProvider(db, profileId, { limit: 20 });

			expect(firstPage.reviews).toHaveLength(SEED_VIEW_05_REVIEW_COUNT);
			expect(firstPage.reviews[0]?.reviewerName).toBe(SEED_VIEW_05_NEWEST_REVIEWER_LABEL);
			expect(firstPage.reviews[0]?.dateLabel).toMatch(/September 2026/);
			expect(firstPage.reviews[1]?.dateLabel).toMatch(/August 2026/);

			for (const review of firstPage.reviews) {
				expect(review.reviewerName).toMatch(/^[A-Za-z]+(?:\s[A-Z]\.)?$/);
				expect(review.dateLabel).toMatch(/^[A-Za-z]+ \d{4}$/);
				expect(JSON.stringify(review)).not.toMatch(/T\d{2}:\d{2}/);
			}

			const dates = firstPage.reviews.map((r) => r.dateLabel);
			expect(dates.indexOf('September 2026')).toBeLessThan(dates.lastIndexOf('August 2026'));
		});
	});

	it('TC-VIEW-05c: ignores cursor with invalid createdAt instead of erroring', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const invalidCursor = encodeCursor({
				createdAt: 'not-a-date',
				id: '01900000-0000-7000-8000-000000000701'
			});

			const result = await listPublicReviewsForProvider(db, profileId, {
				cursor: invalidCursor
			});

			expect(result.reviews).toHaveLength(SEED_VIEW_05_REVIEW_COUNT);
			expect(result.reviews[0]?.reviewerName).toBe(SEED_VIEW_05_NEWEST_REVIEWER_LABEL);
		});
	});

	it('TC-VIEW-05b: exposes edited marker and provider reply on seeded fixtures', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const { reviews } = await listPublicReviewsForProvider(db, profileId, { limit: 20 });

			const withReply = reviews.find((r) => r.providerReply?.body === SEED_VIEW_05_REPLY_BODY);
			expect(withReply).toBeDefined();
			expect(withReply?.reviewerName).toBe(SEED_VIEW_05_NEWEST_REVIEWER_LABEL);

			const edited = reviews.find((r) => r.body === SEED_VIEW_05_EDITED_REVIEW_BODY);
			expect(edited?.isEdited).toBe(true);
		});
	});
});
