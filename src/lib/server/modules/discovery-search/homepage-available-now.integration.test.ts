import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSearch } from './app/search';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';
import { eq } from 'drizzle-orm';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

describe('US-DISC-01 homepage available-now integration', () => {
	it('TC-DISC-01a: available cohort ordered by recency appears first', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const search = await runSearch(
				db,
				{ lexicon: await activeLexicon(db) },
				anonymousAuth('127.0.0.1')
			);
			expect(search.cards.length).toBeGreaterThanOrEqual(13);

			const available = search.cards.filter((c) => c.availability.state === 'available');
			expect(available.length).toBe(8);
			expect(available.map((c) => c.displayName)).toEqual([
				'Lerato K.',
				'Amara T.',
				'Kagiso L.',
				'Thandi M.',
				'Boitumelo H.',
				'Jordan B.',
				'Sipho N.',
				'Refilwe G.'
			]);

			const firstUnavailableIndex = search.cards.findIndex(
				(c) => c.availability.state !== 'available'
			);
			expect(firstUnavailableIndex).toBe(8);
			expect(search.cards[firstUnavailableIndex]?.availability.state).toBe('not_available');
		});
	});

	it('TC-DISC-01b: remaining published providers always appear when none are available', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET availability_state = 'not_available', availability_set_at = NULL
			`);

			const search = await runSearch(
				db,
				{ lexicon: await activeLexicon(db) },
				anonymousAuth('127.0.0.1')
			);
			expect(search.cards.length).toBeGreaterThanOrEqual(13);
			expect(search.cards.every((c) => c.availability.state === 'not_available')).toBe(true);
		});
	});

	it('TC-DISC-01c: available cards carry setAt for recency phrasing downstream', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const search = await runSearch(
				db,
				{ lexicon: await activeLexicon(db) },
				anonymousAuth('127.0.0.1')
			);
			const lerato = search.cards.find((c) => c.displayName === 'Lerato K.');
			expect(lerato?.availability.state).toBe('available');
			expect(lerato?.availability.setAt).toBe('2026-09-04T19:15:00.000Z');
		});
	});
});
