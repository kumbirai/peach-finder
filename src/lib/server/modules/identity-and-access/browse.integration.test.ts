import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { runSearch } from '../discovery-search';
import { getPublicProfile, parseProviderProfileId } from '../provider-profile';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';
import { lexiconEntries } from '../platform-configuration/infra/schema';
import { eq } from 'drizzle-orm';

describe('US-ACC-01 browse integration', () => {
	it('anonymous search and profile read expose no login wall data paths', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const lexicon = await db
				.select()
				.from(lexiconEntries)
				.where(eq(lexiconEntries.isActive, true));

			const search = await runSearch(
				db,
				{
					lexicon: lexicon.map((e) => ({ term: e.term, entryType: e.entryType, mapsTo: e.mapsTo }))
				},
				anonymousAuth('127.0.0.1')
			);
			expect(search.cards.length).toBeGreaterThanOrEqual(12);
			expect(search.nextCursor).toBeNull();

			const invalidProfile = parseProviderProfileId('not-a-uuid');
			expect(invalidProfile.ok).toBe(false);

			const available = search.cards.filter((c) => c.availability.state === 'available');
			expect(available.length).toBeGreaterThan(0);
			if (available.length >= 2) {
				const first = available[0]!.availability.setAt ?? '';
				const second = available[1]!.availability.setAt ?? '';
				expect(first.localeCompare(second)).toBeGreaterThanOrEqual(0);
			}

			const profile = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(profile.ok).toBe(true);
			if (profile.ok) {
				expect(profile.value.displayName).toBe('Amara T.');
				expect(profile.value.intro.length).toBeGreaterThan(0);
				expect(profile.value.services.length).toBeGreaterThan(0);
				expect(profile.value.phone).toBe('+27821234001');
			}

			const phoneOff = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>('01900000-0000-7000-8000-000000000102'),
				anonymousAuth('127.0.0.1')
			);
			expect(phoneOff.ok).toBe(true);
			if (phoneOff.ok) {
				expect(phoneOff.value.phone).toBeUndefined();
			}
		});
	});
});
