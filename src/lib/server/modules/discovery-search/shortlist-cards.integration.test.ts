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

describe('US-DISC-08 shortlist cards integration', () => {
	it('TC-DISC-08a: search cards expose every shortlist field', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const search = await runSearch(
				db,
				{ lexicon: await activeLexicon(db), lat: -26.1467, lng: 28.0436 },
				anonymousAuth('127.0.0.1')
			);
			const amara = search.cards.find((card) => card.displayName === 'Amara T.');
			expect(amara).toBeDefined();
			expect(amara?.photoUrl).toBeTruthy();
			expect(amara?.introExtract.length).toBeGreaterThan(0);
			expect(amara?.availability.state).toBe('available');
			expect(amara?.availability.setAt).toBeTruthy();
			expect(amara?.badges.identityVerified).toBe(true);
			expect(amara?.rating).toEqual({ average: 4.9, count: 128 });
			expect(amara?.priceFromCents).toBe(65_000);
			expect(amara?.languages).toContain('English');
			expect(amara?.distanceKm).not.toBeNull();
			expect(amara?.areaName).toBe('Rosebank');
			expect(amara?.messageHref).toContain('action=message');
		});
	});

	it('TC-DISC-08a: unavailable cards still expose availability state', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const search = await runSearch(
				db,
				{ lexicon: await activeLexicon(db) },
				anonymousAuth('127.0.0.1')
			);
			const unavailable = search.cards.find((card) => card.availability.state === 'not_available');
			expect(unavailable).toBeDefined();
			expect(unavailable?.introExtract.length).toBeGreaterThan(0);
			expect(unavailable?.languages.length).toBeGreaterThan(0);
			expect(unavailable?.messageHref).toContain('action=message');
		});
	});

	it('backfills intro_extract from provider intro on projection refresh', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET intro_extract = ''
				WHERE provider_profile_id = '01900000-0000-7000-8000-000000000101'::uuid
			`);

			const { refreshSearchProjection } = await import('./infra/projection-handlers');
			await db.transaction(async (tx) => {
				await refreshSearchProjection(
					tx,
					'01900000-0000-7000-8000-000000000101' as never,
					new Date()
				);
			});

			const search = await runSearch(
				db,
				{ lexicon: await activeLexicon(db) },
				anonymousAuth('127.0.0.1')
			);
			const amara = search.cards.find((card) => card.displayName === 'Amara T.');
			expect(amara?.introExtract).toContain('Deep tissue specialist');
		});
	});
});
