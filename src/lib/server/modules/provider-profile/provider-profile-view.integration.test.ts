import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { getPublicProfile } from '../provider-profile';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';

describe('US-VIEW-01 provider profile view integration', () => {
	it('TC-VIEW-01a: full FR-PROF-01 field set is available on a seeded profile', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profile = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(profile.ok).toBe(true);
			if (!profile.ok) throw new Error('profile missing');

			expect(profile.value.displayName).toBe('Amara T.');
			expect(profile.value.photos.length).toBeGreaterThanOrEqual(1);
			expect(profile.value.intro.length).toBeGreaterThan(0);
			expect(profile.value.services.length).toBeGreaterThan(0);
			expect(profile.value.services[0]?.priceCents).toBeGreaterThanOrEqual(0);
			expect(profile.value.tags.length).toBeGreaterThan(0);
			expect(profile.value.languages.length).toBeGreaterThan(0);
			expect(profile.value.reviews.length).toBeGreaterThan(0);
			expect(profile.value.responseTime).toBe('within_30_min');
			expect(profile.value.onlineStatus).toBeTruthy();
			expect(profile.value.badges.identityVerified).toBe(true);
			expect(profile.value.phone).toBeTruthy();
		});
	});
});
