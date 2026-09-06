import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { getPublicProfile } from '../provider-profile';
import { runSearch } from './app/search';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';
import { asId } from '../../shared/ids';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

describe('US-REV-04 ratings I can search by, fairly', () => {
	it('TC-REV-04a: canonical highly rated URL preserves review-count threshold', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET rating_average = 4.5, rating_count = 2
				WHERE display_name = 'Nomsa P.'
			`);

			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');
			const result = await runSearch(db, { minRating: 4.5, minReviews: 3, lexicon }, viewer);

			expect(result.cards.some((card) => card.displayName === 'Nomsa P.')).toBe(false);
			expect(result.appliedIntents.some((intent) => intent.key === 'highlyRated')).toBe(true);
		});
	});

	it('TC-REV-04a: highly rated maps to configured average and review-count threshold', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET rating_average = 4.4, rating_count = 3
				WHERE display_name = 'Zanele D.'
			`);
			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET rating_average = 4.5, rating_count = 2
				WHERE display_name = 'Nomsa P.'
			`);
			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET rating_average = 4.5, rating_count = 3
				WHERE display_name = 'Thandi M.'
			`);

			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');
			const result = await runSearch(db, { q: 'highly rated', lexicon }, viewer);

			const names = result.cards.map((card) => card.displayName);
			expect(names).not.toContain('Zanele D.');
			expect(names).not.toContain('Nomsa P.');
			expect(names).toContain('Thandi M.');
			expect(
				result.cards.every((card) => {
					if ('state' in card.rating) return false;
					return card.rating.average >= 4.5 && card.rating.count >= 3;
				})
			).toBe(true);
			expect(result.appliedIntents.some((intent) => intent.key === 'highlyRated')).toBe(true);
		});
	});

	it('TC-REV-04b: zero-review providers show New and are excluded from rating filters', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');
			const profileId = asId<'ProviderProfileId'>('01900000-0000-7000-8000-000000000103');

			const unfiltered = await runSearch(db, { lexicon }, viewer);
			const filtered = await runSearch(db, { minRating: 4, lexicon }, viewer);
			const leratoCard = unfiltered.cards.find((card) => card.displayName === 'Lerato K.');

			expect(leratoCard?.rating).toEqual({ state: 'new' });
			expect(filtered.cards.some((card) => card.displayName === 'Lerato K.')).toBe(false);

			const profileResult = await getPublicProfile(db, profileId, viewer);
			expect(profileResult.ok).toBe(true);
			if (!profileResult.ok) throw new Error('profile missing');
			expect(profileResult.value.rating).toEqual({ state: 'new' });
		});
	});
});
