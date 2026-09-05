import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { runSearch } from './app/search';
import { anonymousAuth } from '../../shared/auth-context';
import { lexiconEntries } from '../platform-configuration/infra/schema';
import { removeSearchProjection } from './infra/projection-commands';
import { listings } from '../listing-billing/infra/schema';
import { providerProfiles } from '../provider-profile/infra/schema';
import { asId } from '../../shared/ids';

async function activeLexicon(db: Parameters<typeof runSearch>[0]) {
	const lexicon = await db.select().from(lexiconEntries).where(eq(lexiconEntries.isActive, true));
	return lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }));
}

function indexOfName(names: string[], target: string): number {
	return names.findIndex((name) => name === target);
}

describe('US-DISC-06 availability outranks everything honestly integration', () => {
	it('TC-DISC-06a: available providers rank above unavailable ones in filtered search', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const results = await runSearch(db, { q: 'swedish', lexicon }, viewer);
			const names = results.cards.map((card) => card.displayName);
			const swedishMatches = names.filter((name) =>
				['Thandi M.', 'Nomsa P.', 'Ayanda R.', 'Naledi S.'].includes(name)
			);
			expect(swedishMatches.length).toBeGreaterThanOrEqual(2);

			const thandi = indexOfName(names, 'Thandi M.');
			const nomsa = indexOfName(names, 'Nomsa P.');
			const naledi = indexOfName(names, 'Naledi S.');
			expect(thandi).toBeGreaterThanOrEqual(0);
			expect(results.cards[thandi]?.availability.state).toBe('available');
			if (nomsa >= 0) {
				expect(thandi).toBeLessThan(nomsa);
				expect(results.cards[nomsa]?.availability.state).toBe('not_available');
			}
			if (naledi >= 0) {
				expect(thandi).toBeLessThan(naledi);
				expect(results.cards[naledi]?.isFeatured).toBe(true);
				expect(results.cards[naledi]?.availability.state).toBe('not_available');
			}
		});
	});

	it('TC-DISC-06b: featured-but-unavailable never beats non-featured available', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			await db.execute(sql`
				UPDATE discovery_search.search_projection
				SET search_text = repeat('deep tissue ', 40) || search_text
				WHERE display_name = 'Zanele D.'
			`);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const results = await runSearch(db, { q: 'deep tissue', lexicon }, viewer);
			const names = results.cards.map((card) => card.displayName);
			const kagiso = indexOfName(names, 'Kagiso L.');
			const zanele = indexOfName(names, 'Zanele D.');
			expect(kagiso).toBeGreaterThanOrEqual(0);
			expect(zanele).toBeGreaterThanOrEqual(0);
			expect(results.cards[kagiso]?.availability.state).toBe('available');
			expect(results.cards[kagiso]?.isFeatured).toBe(false);
			expect(results.cards[zanele]?.availability.state).toBe('not_available');
			expect(results.cards[zanele]?.isFeatured).toBe(true);
			expect(kagiso).toBeLessThan(zanele);
		});
	});

	it('TC-DISC-06c: featured cards serialize with isFeatured for always-visible labelling', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const results = await runSearch(db, { lexicon }, viewer);
			const amara = results.cards.find((card) => card.displayName === 'Amara T.');
			const zanele = results.cards.find((card) => card.displayName === 'Zanele D.');
			expect(amara?.isFeatured).toBe(true);
			expect(zanele?.isFeatured).toBe(true);
			expect(results.cards.find((card) => card.displayName === 'Thandi M.')?.isFeatured).toBe(
				false
			);
		});
	});

	it('TC-DISC-06d: unpublished and lapsed-unlisted providers are excluded from discovery', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const lexicon = await activeLexicon(db);
			const viewer = anonymousAuth('127.0.0.1');

			const baseline = await runSearch(db, { lexicon }, viewer);
			expect(baseline.cards.some((card) => card.displayName === 'Nomsa P.')).toBe(true);

			const nomsaProfileId = '01900000-0000-7000-8000-000000000104';
			await db.transaction(async (tx) => {
				await removeSearchProjection(tx, asId<'ProviderProfileId'>(nomsaProfileId));
			});
			await db
				.update(listings)
				.set({ state: 'unpublished', updatedAt: new Date() })
				.where(eq(listings.providerProfileId, nomsaProfileId));
			await db
				.update(providerProfiles)
				.set({ publishState: 'unpublished', unpublishReason: 'owner', updatedAt: new Date() })
				.where(eq(providerProfiles.id, nomsaProfileId));

			const afterLapse = await runSearch(db, { lexicon }, viewer);
			expect(afterLapse.cards.some((card) => card.displayName === 'Nomsa P.')).toBe(false);
			expect(afterLapse.cards.length).toBe(baseline.cards.length - 1);

			const draftProfileId = '01900000-0000-7000-8000-000000000199';
			const draftOwnerId = '01900000-0000-7000-8000-000000000099';
			const areaRows = await db.execute<{ id: string }>(sql`
				select id from platform_configuration.area where slug = 'rosebank' limit 1
			`);
			const areaId = (areaRows as unknown as Array<{ id: string }>)[0]?.id;
			expect(areaId).toBeTruthy();

			await db.execute(sql`
				insert into provider_profile.provider_profile (
					id, owner_id, area_id, intro, publish_state, phone_visible,
					first_published_at, created_at, updated_at
				) values (
					${draftProfileId}::uuid,
					${draftOwnerId}::uuid,
					${areaId}::uuid,
					'Draft therapist never discoverable',
					'draft',
					false,
					null,
					now(),
					now()
				) on conflict do nothing
			`);

			const projectionCount = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from discovery_search.search_projection
				where provider_profile_id = ${draftProfileId}::uuid
			`);
			expect((projectionCount as unknown as Array<{ count: number }>)[0]?.count).toBe(0);

			const withDraft = await runSearch(db, { q: 'draft therapist', lexicon }, viewer);
			expect(withDraft.cards.some((card) => card.providerProfileId === draftProfileId)).toBe(false);
		});
	});
});
