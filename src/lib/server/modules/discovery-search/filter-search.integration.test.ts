import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSearch } from './app/search';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

describe('US-DISC-04 filter and refine integration', () => {
	it('TC-DISC-04a: price, language, and rating filters intersect', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET price_min_cents = 35000, price_max_cents = 35000
				WHERE display_name = 'Thandi M.'
			`);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const baseline = await runSearch(db, { lexicon }, viewer);
			const filtered = await runSearch(
				db,
				{
					lang: ['zu'],
					minRating: 4,
					priceMax: 40_000,
					lexicon
				},
				viewer
			);

			expect(filtered.cards.length).toBeGreaterThan(0);
			expect(filtered.cards.length).toBeLessThan(baseline.cards.length);
			expect(filtered.cards.every((card) => card.displayName === 'Thandi M.')).toBe(true);
			expect(filtered.appliedIntents.map((intent) => intent.key).sort()).toEqual(
				expect.arrayContaining(['lang:zu', 'priceMax:40000', 'rating'])
			);
		});
	});

	it('TC-DISC-04b: removing one filter keeps the others applied', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const both = await runSearch(db, { verified: true, lang: ['zu'], lexicon }, viewer);
			const verifiedOnly = await runSearch(db, { verified: true, lexicon }, viewer);

			expect(both.cards.length).toBeLessThan(verifiedOnly.cards.length);
			expect(both.appliedIntents.some((intent) => intent.key === 'lang:zu')).toBe(true);
			expect(both.appliedIntents.some((intent) => intent.key === 'verified')).toBe(true);
		});
	});

	it('TC-DISC-04c: manual minimum rating includes providers with few reviews', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET rating_average = 4.9, rating_count = 2
				WHERE display_name = 'Nomsa P.'
			`);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const rated = await runSearch(db, { minRating: 4.8, lexicon }, viewer);
			expect(rated.cards.some((card) => card.displayName === 'Nomsa P.')).toBe(true);
		});
	});

	it('TC-DISC-04c: minimum rating excludes zero-review providers', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const unfiltered = await runSearch(db, { lexicon }, viewer);
			const rated = await runSearch(db, { minRating: 4, lexicon }, viewer);

			expect(unfiltered.cards.some((card) => card.displayName === 'Lerato K.')).toBe(true);
			expect(unfiltered.cards.find((card) => card.displayName === 'Lerato K.')?.rating).toEqual({
				state: 'new'
			});
			expect(rated.cards.every((card) => 'average' in card.rating)).toBe(true);
			expect(rated.cards.some((card) => card.displayName === 'Lerato K.')).toBe(false);
		});
	});
});
