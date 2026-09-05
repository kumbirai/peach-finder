import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import type { AreaId, UserId } from '../../shared/ids';
import {
	addService,
	attachOnboardingPhoto,
	createDraftProfile,
	getProfilePreviewForOwner,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
	unpublishProfileForOwnerDb,
	updateArea,
	updateIntro,
	updatePhoneVisibility
} from '../provider-profile';

async function registerVerifiedProvider(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	areaId: AreaId,
	label: string
): Promise<UserId> {
	const now = new Date();
	const reg = await registerProvider(
		db,
		{
			email: `${label}-${Date.now()}@example.com`,
			password: 'password123',
			displayName: 'Preview Test',
			phone: `+2786${String(Date.now()).slice(-7)}`,
			acceptedTerms: true
		},
		now,
		`corr-${label}`
	);
	expect(reg.ok).toBe(true);
	if (!reg.ok || !reg.value.otpId) throw new Error('registration failed');

	const verified = await verifyOtp(
		db,
		{ otpId: reg.value.otpId, code: getDevOtpCode(reg.value.otpId)! },
		now,
		`corr-${label}-verify`
	);
	expect(verified.ok).toBe(true);
	if (!verified.ok) throw new Error('verify failed');
	return verified.value.userId as UserId;
}

async function publishMinimalProfile(
	db: Parameters<typeof registerVerifiedProvider>[0],
	ownerId: UserId,
	areaId: AreaId
) {
	const now = new Date();
	await createDraftProfile(db, ownerId, areaId);
	await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
	await updateIntro(db, ownerId, 'Preview as seeker integration intro.', crypto.randomUUID(), now);
	await addService(
		db,
		ownerId,
		{ name: 'Swedish', durationMinutes: 60, priceCents: 50000 },
		crypto.randomUUID(),
		now
	);
	await setLanguages(db, ownerId, ['en'], crypto.randomUUID(), now);
	await updateArea(db, ownerId, areaId, crypto.randomUUID(), now);
	const published = await publishProfileForOwner(db, ownerId, 'corr-publish', now);
	expect(published.ok).toBe(true);
	const profile = await loadOwnerProfile(db, ownerId);
	if (!profile) throw new Error('missing profile');
	return profile;
}

describe('US-PONB-08 preview as seeker', () => {
	it('TC-PONB-08a: anonymous preview omits phone; seeker preview includes it when phone_visible is OFF', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb08a');
			await publishMinimalProfile(db, ownerId, areaId);

			const anonymous = await getProfilePreviewForOwner(db, ownerId, 'anonymous', '127.0.0.1');
			const seeker = await getProfilePreviewForOwner(db, ownerId, 'seeker', '127.0.0.1');

			expect(anonymous.ok).toBe(true);
			expect(seeker.ok).toBe(true);
			if (!anonymous.ok || !seeker.ok) throw new Error('preview failed');

			expect(anonymous.value.phone).toBeUndefined();
			expect('phone' in anonymous.value).toBe(false);
			expect(seeker.value.phone).toMatch(/^\+27/);
		});
	});

	it('both previews include phone when phone_visible is ON', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb08b');
			await publishMinimalProfile(db, ownerId, areaId);
			const visible = await updatePhoneVisibility(
				db,
				ownerId,
				true,
				crypto.randomUUID(),
				new Date()
			);
			expect(visible.ok).toBe(true);

			const anonymous = await getProfilePreviewForOwner(db, ownerId, 'anonymous', '127.0.0.1');
			const seeker = await getProfilePreviewForOwner(db, ownerId, 'seeker', '127.0.0.1');

			expect(anonymous.ok).toBe(true);
			expect(seeker.ok).toBe(true);
			if (!anonymous.ok || !seeker.ok) throw new Error('preview failed');

			expect(anonymous.value.phone).toMatch(/^\+27/);
			expect(seeker.value.phone).toMatch(/^\+27/);
		});
	});

	it('returns not_found when caller has no profile', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = await registerVerifiedProvider(
				db,
				(await listAreas(db)).find((a) => a.slug === 'rosebank')!.id as AreaId,
				'ponb08c'
			);

			const preview = await getProfilePreviewForOwner(db, ownerId, 'anonymous', '127.0.0.1');
			expect(preview.ok).toBe(false);
			if (preview.ok) throw new Error('expected not_found');
			expect(preview.error.kind).toBe('not_found');
		});
	});

	it('preview works when profile is unpublished (hidden from seekers)', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb08d');
			await publishMinimalProfile(db, ownerId, areaId);

			const hidden = await unpublishProfileForOwnerDb(
				db,
				ownerId,
				'owner',
				'corr-unpublish-preview',
				new Date()
			);
			expect(hidden).not.toBeNull();

			const owner = await loadOwnerProfile(db, ownerId);
			expect(owner?.publishState).toBe('unpublished');

			const anonymous = await getProfilePreviewForOwner(db, ownerId, 'anonymous', '127.0.0.1');
			const seeker = await getProfilePreviewForOwner(db, ownerId, 'seeker', '127.0.0.1');

			expect(anonymous.ok).toBe(true);
			expect(seeker.ok).toBe(true);
			if (!anonymous.ok || !seeker.ok) throw new Error('preview failed');

			expect(anonymous.value.intro).toContain('Preview as seeker');
			expect(seeker.value.phone).toMatch(/^\+27/);
			expect(anonymous.value.phone).toBeUndefined();
		});
	});
});
