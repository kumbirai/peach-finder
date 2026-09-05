import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import {
	attachProfilePhoto,
	createDraftProfile,
	getGalleryReadyCount,
	loadOwnerProfile,
	proposeServiceTag,
	reorderProfilePhotos,
	setPrimaryProfilePhoto
} from '../provider-profile';
import { uploadProfilePhoto } from '../media-processing';
import type { Database } from '../../db';
import type { AreaId, PhotoId, UserId } from '../../shared/ids';
import { INTRO_MAX_LENGTH, validateIntro } from '../provider-profile/domain/intro-policy';

async function registerProviderUser(db: Database): Promise<UserId> {
	const now = new Date();
	const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
	const reg = await registerProvider(
		db,
		{
			email: `ponb03-${stamp}@example.com`,
			password: 'password123',
			displayName: 'Profile Build',
			phone: `+2784${stamp.slice(-7)}`,
			acceptedTerms: true
		},
		now,
		'test-corr-ponb-03'
	);
	if (!reg.ok) throw new Error(`register failed: ${JSON.stringify(reg)}`);
	if (!reg.value.otpId) throw new Error('missing otpId after register');
	const code = getDevOtpCode(reg.value.otpId);
	if (!code) throw new Error('missing dev OTP code');
	const verified = await verifyOtp(db, { otpId: reg.value.otpId, code }, now, 'test-corr-ponb-03b');
	expect(verified.ok).toBe(true);
	if (!verified.ok) throw new Error('verify failed');
	return verified.value.userId as UserId;
}

describe('US-PONB-03 profile media integration', () => {
	it('TC-PONB-03a: enforces gallery cap at 12 photos', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			const ownerId = await registerProviderUser(db);
			await createDraftProfile(db, ownerId, areaId);

			for (let i = 0; i < 12; i++) {
				const ready = await getGalleryReadyCount(db, ownerId);
				const bytes = await sharp({
					create: {
						width: 32 + i,
						height: 32 + i,
						channels: 3,
						background: { r: 40 + i * 11, g: 80 + i * 7, b: 120 + i * 5 }
					}
				})
					.jpeg()
					.toBuffer();
				const uploaded = await uploadProfilePhoto(
					db,
					ownerId,
					bytes,
					'profile_photo',
					ready,
					crypto.randomUUID(),
					new Date()
				);
				expect(uploaded.ok, uploaded.ok ? '' : JSON.stringify(uploaded)).toBe(true);
				if (!uploaded.ok) return;
				const attached = await attachProfilePhoto(
					db,
					ownerId,
					uploaded.value.photoId as PhotoId,
					crypto.randomUUID(),
					new Date()
				);
				expect(attached.ok).toBe(true);
			}

			const blockedBytes = await sharp({
				create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } }
			})
				.jpeg()
				.toBuffer();
			const blocked = await uploadProfilePhoto(
				db,
				ownerId,
				blockedBytes,
				'profile_photo',
				12,
				crypto.randomUUID(),
				new Date()
			);
			expect(blocked.ok).toBe(false);
			if (blocked.ok) return;
			expect(blocked.error.kind).toBe('conflict');
		});
	});

	it('TC-PONB-03d: intro policy caps at 600 characters', () => {
		const long = 'a'.repeat(INTRO_MAX_LENGTH + 1);
		expect(validateIntro(long).length).toBeGreaterThan(0);
		expect(validateIntro('a'.repeat(INTRO_MAX_LENGTH))).toEqual([]);
	});

	it('TC-PONB-03e: tag proposal does not block profile state', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const ownerId = await registerProviderUser(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			await createDraftProfile(db, ownerId, areaId);

			const proposed = await proposeServiceTag(db, ownerId, 'Hot stone');
			expect(proposed.ok).toBe(true);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.publishState).toBe('draft');
		});
	});

	it('supports reorder and primary selection', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const ownerId = await registerProviderUser(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			await createDraftProfile(db, ownerId, areaId);

			const ids: PhotoId[] = [];
			for (let i = 0; i < 2; i++) {
				const ready = await getGalleryReadyCount(db, ownerId);
				const bytes = await sharp({
					create: {
						width: 48,
						height: 48,
						channels: 3,
						background: { r: 100 + i * 40, g: 120, b: 140 }
					}
				})
					.jpeg()
					.toBuffer();
				const uploaded = await uploadProfilePhoto(
					db,
					ownerId,
					bytes,
					'profile_photo',
					ready,
					crypto.randomUUID(),
					new Date()
				);
				expect(uploaded.ok, uploaded.ok ? '' : JSON.stringify(uploaded)).toBe(true);
				if (!uploaded.ok) return;
				ids.push(uploaded.value.photoId as PhotoId);
				await attachProfilePhoto(db, ownerId, ids[i]!, crypto.randomUUID(), new Date());
			}

			const reordered = await reorderProfilePhotos(
				db,
				ownerId,
				[ids[1]!, ids[0]!],
				crypto.randomUUID(),
				new Date()
			);
			expect(reordered.ok).toBe(true);

			const primary = await setPrimaryProfilePhoto(
				db,
				ownerId,
				ids[1]!,
				crypto.randomUUID(),
				new Date()
			);
			expect(primary.ok).toBe(true);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.photos.find((p) => p.isPrimary)?.photoId).toBe(ids[1]);
		});
	});
});
