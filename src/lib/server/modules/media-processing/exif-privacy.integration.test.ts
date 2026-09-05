import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { createDraftProfile, getGalleryReadyCount } from '../provider-profile';
import { uploadProfilePhoto, getPhotoVariantUrls } from '../media-processing';
import type { Database } from '../../db';
import type { AreaId, UserId } from '../../shared/ids';
import { assertNoImageMetadata, createGeotaggedJpegFixture } from './test-support/geotagged-jpeg';
import { readLocalMediaFile } from './infra/storage';

async function registerProviderUser(db: Database): Promise<UserId> {
	const now = new Date();
	const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
	const reg = await registerProvider(
		db,
		{
			email: `priv02-${stamp}@example.com`,
			password: 'password123',
			displayName: 'Address Privacy',
			phone: `+2784${stamp.slice(-7)}`,
			acceptedTerms: true
		},
		now,
		'test-corr-priv-02'
	);
	if (!reg.ok) throw new Error(`register failed: ${JSON.stringify(reg)}`);
	if (!reg.value.otpId) throw new Error('missing otpId after register');
	const code = getDevOtpCode(reg.value.otpId);
	if (!code) throw new Error('missing dev OTP code');
	const verified = await verifyOtp(db, { otpId: reg.value.otpId, code }, now, 'test-corr-priv-02b');
	expect(verified.ok).toBe(true);
	if (!verified.ok) throw new Error('verify failed');
	return verified.value.userId as UserId;
}

describe('US-PRIV-02 EXIF privacy', () => {
	it('TC-PRIV-02b: upload pipeline strips GPS EXIF from every generated variant', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-priv02-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const source = await createGeotaggedJpegFixture();
			const sourceMeta = await sharp(source).metadata();
			expect(sourceMeta.exif?.length).toBeGreaterThan(0);

			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			const ownerId = await registerProviderUser(db);
			await createDraftProfile(db, ownerId, areaId);

			const ready = await getGalleryReadyCount(db, ownerId);
			const uploaded = await uploadProfilePhoto(
				db,
				ownerId,
				source,
				'profile_photo',
				ready,
				crypto.randomUUID(),
				new Date()
			);
			expect(uploaded.ok, uploaded.ok ? '' : JSON.stringify(uploaded)).toBe(true);
			if (!uploaded.ok) return;

			const variants = await getPhotoVariantUrls(db, uploaded.value.photoId);
			expect(Object.keys(variants).length).toBeGreaterThan(0);

			for (const url of Object.values(variants)) {
				const objectKey = url.replace(/^.*\/media\//, '');
				const bytes = await readLocalMediaFile(objectKey);
				expect(bytes).not.toBeNull();
				if (!bytes) return;
				await assertNoImageMetadata(bytes);
			}
		});
	});
});
