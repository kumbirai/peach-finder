import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSuggest } from './app/search';

const SEED_PROVIDER_NAMES = [
	'Amara T.',
	'Thandi M.',
	'Lerato K.',
	'Nomsa P.',
	'Zanele D.',
	'Sipho N.',
	'Ayanda R.',
	'Kagiso L.',
	'Naledi S.',
	'Boitumelo H.',
	'Mandla Z.',
	'Refilwe G.'
];

describe('US-DISC-03 search suggestions integration', () => {
	it('TC-DISC-03a: partial service term returns prefix-matched suggestions', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const suggestions = await runSuggest(db, 'dee');
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions.some((s) => s.term === 'deep tissue')).toBe(true);
			expect(
				suggestions.every((s) => s.term.toLowerCase().includes('dee') || s.term.includes('dee'))
			).toBe(true);
		});
	});

	it('TC-DISC-03b: provider display names never appear in suggestions', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			for (const name of SEED_PROVIDER_NAMES) {
				const suggestions = await runSuggest(db, name);
				const terms = suggestions.map((s) => s.term);
				for (const providerName of SEED_PROVIDER_NAMES) {
					expect(terms).not.toContain(providerName);
				}
			}
		});
	});

	it('returns fuzzy matches for minor typos via trigram index', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const suggestions = await runSuggest(db, 'swedsh');
			expect(suggestions.some((s) => s.term === 'swedish')).toBe(true);
		});
	});

	it('returns empty array for blank prefix', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			expect(await runSuggest(db, '')).toEqual([]);
			expect(await runSuggest(db, '   ')).toEqual([]);
		});
	});
});
