import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { hasEligibleThread } from './index';
import {
	seedReviews,
	SEED_REV_ELIGIBLE_SEEKER_ID,
	SEED_REV_INELIGIBLE_SEEKER_ID,
	SEED_REV_PROVIDER_PROFILE_ID
} from '../../../../../scripts/seed-reviews';
import { asId } from '../../shared/ids';

describe('direct-messaging hasEligibleThread', () => {
	it('TC-REV-01a: enforces the 24-hour thread-age boundary', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedReviews(db);

			const providerProfileId = asId<'ProviderProfileId'>(SEED_REV_PROVIDER_PROFILE_ID);
			const now = new Date();

			expect(
				await hasEligibleThread(
					db,
					asId<'UserId'>(SEED_REV_INELIGIBLE_SEEKER_ID),
					providerProfileId,
					24,
					now
				)
			).toBe(false);

			expect(
				await hasEligibleThread(
					db,
					asId<'UserId'>(SEED_REV_ELIGIBLE_SEEKER_ID),
					providerProfileId,
					24,
					now
				)
			).toBe(true);
		});
	});
});
