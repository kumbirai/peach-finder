import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import {
	SEED_CORE_PHONE_OFF_NUMBER,
	SEED_CORE_PHONE_OFF_PROFILE_ID,
	SEED_CORE_PRIMARY_PROFILE_ID,
	seedCore
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { lexiconEntries } from '../platform-configuration/infra/schema';
import { runSearch } from '../discovery-search';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';
import { getPublicProfile, getProfilePreviewForOwner } from '../provider-profile';
import { users } from '../identity-and-access/infra/schema';

function assertPhoneKeyAbsent(payload: Record<string, unknown>, secret: string) {
	expect('phone' in payload).toBe(false);
	expect(payload.phone).toBeUndefined();
	const serialized = JSON.stringify(payload);
	expect(serialized).not.toContain('"phone"');
	expect(serialized).not.toContain(secret);
}

describe('US-PRIV-01 phone privacy', () => {
	it('TC-PRIV-01a: phone key absent from anonymous profile JSON, not merely falsy', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const anonymous = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PHONE_OFF_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile read failed');

			assertPhoneKeyAbsent(
				anonymous.value as unknown as Record<string, unknown>,
				SEED_CORE_PHONE_OFF_NUMBER
			);
		});
	});

	it('TC-PRIV-01a: search cards never include phone for any anonymous result', async () => {
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
			expect(search.cards.length).toBeGreaterThan(0);

			const serialized = JSON.stringify(search.cards);
			expect(serialized).not.toContain('"phone"');
			expect(serialized).not.toMatch(/\+27\d{9}/);
			for (const card of search.cards) {
				expect('phone' in card).toBe(false);
			}
		});
	});

	it('TC-PRIV-01a: anonymous preview API omits phone when visibility is OFF', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerRows = await db
				.select({ ownerId: users.id })
				.from(users)
				.where(eq(users.id, '01900000-0000-7000-8000-000000000002'))
				.limit(1);
			const ownerId = ownerRows[0]?.ownerId;
			expect(ownerId).toBeTruthy();
			if (!ownerId) throw new Error('missing Thandi seed owner');

			const preview = await getProfilePreviewForOwner(
				db,
				asId<'UserId'>(ownerId),
				'anonymous',
				'127.0.0.1'
			);
			expect(preview.ok).toBe(true);
			if (!preview.ok) throw new Error('preview read failed');

			assertPhoneKeyAbsent(
				preview.value as unknown as Record<string, unknown>,
				SEED_CORE_PHONE_OFF_NUMBER
			);
		});
	});

	it('TC-PRIV-01a: phone-ON seed provider still exposes phone to anonymous viewers', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const anonymous = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile read failed');
			expect(anonymous.value.phone).toMatch(/^\+27/);
		});
	});
});
