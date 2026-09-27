import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { queryRows } from '../../shared/sql-result';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';
import { runSearch } from './app/search';
import {
	corruptAvailabilityOnProjection,
	runSearchProjectionReconcile
} from './infra/projection-reconcile';

describe('search projection hourly reconcile', () => {
	it('repairs a corrupted availability projection from owning facades', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const corrupted = await corruptAvailabilityOnProjection(db, profileId);
			expect(corrupted).toBe(true);

			const stale = await runSearch(db, { lexicon: [], limit: 40 }, anonymousAuth('127.0.0.1'));
			const staleCard = stale.cards.find((card) => card.providerProfileId === profileId);
			expect(staleCard?.availability.state).toBe('not_available');

			const result = await runSearchProjectionReconcile(db, new Date());
			expect(result.upserted).toBeGreaterThan(0);

			const repaired = await runSearch(db, { lexicon: [], limit: 40 }, anonymousAuth('127.0.0.1'));
			const card = repaired.cards.find((c) => c.providerProfileId === profileId);
			expect(card?.availability.state).toBe('available');

			const row = await db.execute(sql`
				SELECT availability_state
				FROM discovery_search.search_projection
				WHERE provider_profile_id = ${profileId}::uuid
			`);
			expect(queryRows(row)[0]?.availability_state).toBe('available');
		});
	}, 90_000);
});
