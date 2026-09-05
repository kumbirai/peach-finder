import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSearch } from './app/search';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';

const DEEP_TISSUE_TAG = '01900000-0000-7000-8000-000000000201';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

describe('US-DISC-02 natural-language search integration', () => {
	it('TC-DISC-02a: BRD example queries resolve to sensible filtered sets', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const availableNow = await runSearch(
				db,
				{ q: 'Massage therapist available now', lexicon },
				viewer
			);
			expect(availableNow.cards.length).toBeGreaterThan(0);
			expect(availableNow.cards.every((c) => c.availability.state === 'available')).toBe(true);

			const deepTissueNear = await runSearch(
				db,
				{ q: 'Deep tissue massage near me', lexicon },
				viewer
			);
			expect(deepTissueNear.cards.length).toBeGreaterThan(0);
			expect(deepTissueNear.appliedIntents.some((i) => i.key === `tag:${DEEP_TISSUE_TAG}`)).toBe(
				true
			);
			expect(deepTissueNear.appliedIntents.some((i) => i.key === 'near')).toBe(true);

			const tonight = await runSearch(
				db,
				{ q: 'Massage therapist available tonight', lexicon },
				viewer
			);
			expect(tonight.cards.length).toBeGreaterThan(0);
			expect(tonight.cards.every((c) => c.availability.state === 'available')).toBe(true);

			const highlyRated = await runSearch(
				db,
				{ q: 'Highly rated massage therapist', lexicon },
				viewer
			);
			expect(highlyRated.cards.length).toBeGreaterThan(0);
			expect(
				highlyRated.cards.every((c) => {
					if ('state' in c.rating) return false;
					return c.rating.average >= 4.5 && c.rating.count >= 3;
				})
			).toBe(true);

			const zulu = await runSearch(db, { q: 'Massage therapist who speaks Zulu', lexicon }, viewer);
			const zuluSpeakers = new Set(['Thandi M.', 'Ayanda R.', 'Refilwe G.']);
			expect(zulu.cards.length).toBeGreaterThan(0);
			expect(zulu.cards.every((c) => zuluSpeakers.has(c.displayName))).toBe(true);
		});
	});

	it('TC-DISC-02b: identical ordering for two anonymous sessions', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);

			const a = await runSearch(
				db,
				{ q: 'Highly rated massage therapist', lexicon },
				anonymousAuth('10.0.0.1')
			);
			const b = await runSearch(
				db,
				{ q: 'Highly rated massage therapist', lexicon },
				anonymousAuth('10.0.0.2')
			);
			expect(a.cards.map((c) => c.providerProfileId)).toEqual(
				b.cards.map((c) => c.providerProfileId)
			);
		});
	});

	it('TC-DISC-02c: applied intents expose removable chip metadata', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);

			const result = await runSearch(
				db,
				{ q: 'Deep tissue massage near me', lexicon },
				anonymousAuth('127.0.0.1')
			);
			expect(result.appliedIntents.some((i) => i.key === `tag:${DEEP_TISSUE_TAG}`)).toBe(true);
			expect(result.appliedIntents.some((i) => i.key === 'near')).toBe(true);
			expect(result.appliedIntents.every((i) => i.label.length > 0)).toBe(true);
		});
	});

	it('ignores non-finite minRating instead of producing NaN filter chips', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const baseline = await runSearch(db, { lexicon }, viewer);
			const invalid = await runSearch(db, { lexicon, minRating: Number.NaN }, viewer);

			expect(invalid.appliedIntents.some((i) => i.key === 'rating')).toBe(false);
			expect(invalid.cards.map((c) => c.providerProfileId)).toEqual(
				baseline.cards.map((c) => c.providerProfileId)
			);
		});
	});
});
