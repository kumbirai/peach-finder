import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PHONE_OFF_PROFILE_ID,
	SEED_CORE_PHONE_OFF_NUMBER,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../../../../scripts/seed-core';
import {
	buildShareMetadata,
	getPublicProfile,
	loadPrimarySharePhotoUrl
} from '../provider-profile';
import { anonymousAuth, createAuthContext } from '../../shared/auth-context';
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
			expect(profile.value.reviews.length).toBeGreaterThanOrEqual(6);
			expect(profile.value.reviews[0]?.reviewerName).toMatch(/^[A-Za-z]+(?:\s[A-Z]\.)?$/);
			expect(profile.value.reviews[0]?.dateLabel).toMatch(/^[A-Za-z]+ \d{4}$/);
			expect(profile.value.responseTime).toBe('within_30_min');
			expect(profile.value.onlineStatus).toBeTruthy();
			expect(profile.value.badges.identityVerified).toBe(true);
			expect(profile.value.phone).toBeTruthy();
		});
	});
});

describe('US-VIEW-03 contact actions integration', () => {
	it('TC-VIEW-03b: phone omitted for anonymous viewers when visibility is OFF, included for signed-in seekers', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PHONE_OFF_PROFILE_ID);
			const anonymous = await getPublicProfile(db, profileId, anonymousAuth('127.0.0.1'));
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile missing');
			expect(anonymous.value.phone).toBeUndefined();
			expect('phone' in anonymous.value).toBe(false);
			expect(JSON.stringify(anonymous.value)).not.toContain(SEED_CORE_PHONE_OFF_NUMBER);

			const signedIn = await getPublicProfile(
				db,
				profileId,
				createAuthContext({
					userId: asId<'UserId'>('01900000-0000-7000-8000-000000009901'),
					role: 'seeker',
					sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000009902'),
					ipAddress: '127.0.0.1'
				})
			);
			expect(signedIn.ok).toBe(true);
			if (!signedIn.ok) throw new Error('profile missing');
			expect(signedIn.value.phone).toBe(SEED_CORE_PHONE_OFF_NUMBER);
		});
	});
});

describe('US-VIEW-06 share profile integration', () => {
	it('TC-VIEW-06b: share metadata uses display name, intro extract, and card_640 primary photo', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const profile = await getPublicProfile(db, profileId, anonymousAuth('127.0.0.1'));
			expect(profile.ok).toBe(true);
			if (!profile.ok) throw new Error('profile missing');

			const sharePhotoUrl = await loadPrimarySharePhotoUrl(db, profileId);
			expect(sharePhotoUrl).toBeTruthy();

			const metadata = buildShareMetadata(
				profile.value.displayName,
				profile.value.intro,
				sharePhotoUrl,
				'https://peachfinder.test'
			);

			expect(metadata.title).toBe('Amara T.');
			expect(metadata.description.length).toBeGreaterThan(0);
			expect(metadata.description).toContain('Deep tissue');
			expect(sharePhotoUrl).toBe('/placeholder-photo.svg');
			expect(metadata.image).toBe('https://peachfinder.test/placeholder-photo.svg');
		});
	});
});
