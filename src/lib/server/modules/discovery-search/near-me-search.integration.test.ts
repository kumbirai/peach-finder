import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSearch } from './app/search';
import { resolveSearchCoords } from './app/resolve-search-coords';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

const ROSEBANK_LAT = -26.1448;
const ROSEBANK_LNG = 28.0416;

describe('US-DISC-05 near me without giving up my privacy integration', () => {
	it('TC-DISC-05a: proximity coords order results by distance to provider area', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const result = await runSearch(
				db,
				{ near: true, lat: ROSEBANK_LAT, lng: ROSEBANK_LNG, lexicon },
				viewer
			);

			expect(result.proximityLabel).toBe('Near you');
			expect(result.cards.length).toBeGreaterThan(1);
			expect(result.cards.every((card) => card.distanceKm != null)).toBe(true);

			const rosebankDistance = result.cards.find(
				(card) => card.areaName === 'Rosebank'
			)?.distanceKm;
			const sandtonDistance = result.cards.find((card) => card.areaName === 'Sandton')?.distanceKm;
			const capeTownDistance = result.cards.find(
				(card) => card.areaName === 'Cape Town'
			)?.distanceKm;
			expect(rosebankDistance).not.toBeNull();
			expect(sandtonDistance).not.toBeNull();
			expect(capeTownDistance).not.toBeNull();
			expect(rosebankDistance!).toBeLessThan(sandtonDistance!);
			expect(sandtonDistance!).toBeLessThan(capeTownDistance!);
		});
	});

	it('TC-DISC-05b: manual area slug resolves to centroid for proximity search', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const coords = await resolveSearchCoords(db, { areaSlug: 'rosebank' });
			expect(coords.lat).toBe(ROSEBANK_LAT);
			expect(coords.lng).toBe(ROSEBANK_LNG);
			expect(coords.areaName).toBe('Rosebank');

			const result = await runSearch(db, { near: true, areaSlug: 'rosebank', lexicon }, viewer);
			expect(result.proximityLabel).toBe('Near Rosebank');
			expect(result.cards.some((card) => card.distanceKm != null)).toBe(true);
		});
	});

	it('TC-DISC-05c: device coordinates are not persisted during search', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');
			const lat = -33.9249;
			const lng = 18.4241;

			await runSearch(db, { near: true, lat, lng, lexicon }, viewer);

			const audit = await db.execute(sql`
				SELECT count(*)::int AS hits
				FROM shared.audit_log
				WHERE metadata::text LIKE ${`%${lat}%`}
			`);
			const outbox = await db.execute(sql`
				SELECT count(*)::int AS hits
				FROM shared.outbox
				WHERE payload::text LIKE ${`%${lat}%`}
			`);
			const auditHits = Number((audit as unknown as { hits: number }[])[0]?.hits ?? 0);
			const outboxHits = Number((outbox as unknown as { hits: number }[])[0]?.hits ?? 0);
			expect(auditHits).toBe(0);
			expect(outboxHits).toBe(0);
		});
	});
});
