import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { getSubscription, getActiveListingCount } from './infra/subscription-read';
import { asId } from '../../shared/ids';

describe('US-ADMIN-05 listing billing read integration', () => {
	it('TC-ADMIN-05a: returns listing state for a seeded provider profile', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const subscription = await getSubscription(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID)
			);
			expect(subscription?.state).toBe('free_listed');
			expect(subscription?.listingLabel).toBe('Active listing');

			const activeCount = await getActiveListingCount(db);
			expect(activeCount).toBeGreaterThan(0);
		});
	});
});
