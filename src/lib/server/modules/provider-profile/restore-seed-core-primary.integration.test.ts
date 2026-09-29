import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { unpublishProfileForOwnerDb } from './infra/unpublish-profile';
import { asId } from '../../shared/ids';
import { providerProfiles } from './infra/schema';
import { restoreSeedCorePrimaryListing } from './infra/restore-seed-core-primary';
import { anonymousAuth } from '../../shared/auth-context';
import { runSearch } from '../discovery-search/app/search';

describe('restoreSeedCorePrimaryListing', () => {
	it('republishes Amara and restores filtered search membership after moderation unpublish', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerRows = await db
				.select({ ownerId: providerProfiles.ownerId })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, SEED_CORE_PRIMARY_PROFILE_ID))
				.limit(1);
			const ownerId = asId<'UserId'>(ownerRows[0]!.ownerId);

			await unpublishProfileForOwnerDb(
				db,
				ownerId,
				'admin',
				'test-corr-unpublish',
				new Date()
			);

			const viewer = anonymousAuth('127.0.0.1');
			const hidden = await runSearch(db, { q: 'deep tissue', lexicon: [] }, viewer);
			expect(hidden.cards.map((card) => card.providerProfileId)).not.toContain(
				SEED_CORE_PRIMARY_PROFILE_ID
			);

			const restored = await restoreSeedCorePrimaryListing(db, new Date(), 'test-corr-restore');
			expect(restored.republished).toBe(true);

			const live = await runSearch(db, { q: 'deep tissue', lexicon: [] }, viewer);
			expect(live.cards.map((card) => card.providerProfileId)).toContain(SEED_CORE_PRIMARY_PROFILE_ID);
		});
	});
});
