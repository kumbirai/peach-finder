import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSearch } from './app/search';
import { removeIntentFromState, structuredQueryToParams } from '../../../../lib/search-url';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

describe('US-DISC-07 empty result relaxation integration', () => {
	it('TC-DISC-07a: zero results name constraints and suggest available_now first', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const empty = await runSearch(
				db,
				{
					available: true,
					verified: true,
					lang: ['zu'],
					minRating: 4.8,
					priceMax: 10_000,
					lexicon
				},
				viewer
			);

			expect(empty.cards).toHaveLength(0);
			expect(empty.appliedIntents.length).toBeGreaterThan(0);
			expect(empty.relaxation).not.toBeNull();
			expect(empty.relaxation?.intentKey).toBe('available');
			expect(empty.relaxation?.actionLabel).toContain('Available now');

			const next = await runSearch(
				db,
				{
					verified: true,
					lang: ['zu'],
					minRating: 4.8,
					priceMax: 10_000,
					lexicon
				},
				viewer
			);
			expect(next.relaxation?.intentKey).toBe('rating');
		});
	});

	it('deterministic priority: near_me before price band on identical query', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const empty = await runSearch(
				db,
				{
					near: true,
					lat: -26.1076,
					lng: 28.0567,
					priceMax: 10_000,
					verified: true,
					lexicon
				},
				viewer
			);

			expect(empty.cards).toHaveLength(0);
			expect(empty.relaxation?.intentKey).toBe('near');
		});
	});

	it('relaxation href removes exactly one filter from URL state', () => {
		const state = {
			q: '',
			verified: true,
			available: true,
			langs: ['zu'],
			tags: [],
			minRating: null,
			priceMin: null,
			priceMax: 10_000,
			near: false,
			lat: null,
			lng: null,
			areaSlug: null
		};
		const relaxed = removeIntentFromState(state, 'available');
		const params = structuredQueryToParams(relaxed);
		expect(params.get('available')).toBeNull();
		expect(params.get('verified')).toBe('1');
		expect(params.getAll('lang')).toEqual(['zu']);
		expect(params.get('priceMax')).toBe('10000');
	});
});
