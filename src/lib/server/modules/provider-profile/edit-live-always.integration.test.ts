import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { updateDisplayName } from '../identity-and-access/infra/account-commands';
import { applyIdentityAttributesChangedSync } from '../../shared/identity-change-sync';
import { anonymousAuth } from '../../shared/auth-context';
import type { AreaId, PhotoId, UserId } from '../../shared/ids';
import {
	addService,
	attachOnboardingPhoto,
	createDraftProfile,
	getPublicProfile,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
	updateArea,
	updateIntro
} from '../provider-profile';
import { finalizePhotoFromMediaProcessed } from './infra/photo-commands';
import { loadBadgeDisplayState, grantIdentityBadgeDev } from '../trust-and-safety';

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
			displayName: 'Live Edit Test',
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
	await updateIntro(db, ownerId, 'Original live intro text.', crypto.randomUUID(), now);
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

describe('US-PONB-05 edit live always integration', () => {
	it('TC-PONB-05a: intro edit is publicly visible immediately with no gate', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-05a');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			expect(profile.publishState).toBe('published');

			const updatedIntro = 'Updated live intro without any review gate.';
			const saved = await updateIntro(db, ownerId, updatedIntro, 'corr-ponb-05a-intro', new Date());
			expect(saved.ok).toBe(true);

			const after = await loadOwnerProfile(db, ownerId);
			expect(after?.publishState).toBe('published');
			expect(after?.intro).toBe(updatedIntro);

			const viewer = anonymousAuth('127.0.0.1');
			const publicView = await getPublicProfile(db, profile.profileId, viewer);
			expect(publicView.ok).toBe(true);
			if (!publicView.ok) return;
			expect(publicView.value.intro).toBe(updatedIntro);

			const projection = await db.execute<{ search_text: string }>(sql`
				select search_text from discovery_search.search_projection
				where provider_profile_id = ${profile.profileId}::uuid
			`);
			expect((projection as unknown as Array<{ search_text: string }>)[0]?.search_text).toContain(
				'Updated live intro'
			);
		});
	});

	it('TC-PONB-05b: display name change suppresses identity badge only', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-05b');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			await grantIdentityBadgeDev(db, profile.profileId, new Date());

			const beforeBadge = await loadBadgeDisplayState(db, profile.profileId);
			expect(beforeBadge.identityVerified).toBe(true);

			const viewer = anonymousAuth('127.0.0.1');
			const beforePublic = await getPublicProfile(db, profile.profileId, viewer);
			expect(beforePublic.ok).toBe(true);
			if (!beforePublic.ok) return;
			expect(beforePublic.value.badges.identityVerified).toBe(true);

			const now = new Date();
			const renamed = await updateDisplayName(
				db,
				ownerId,
				'Renamed Provider',
				'corr-ponb-05b-name',
				now
			);
			expect(renamed.ok).toBe(true);
			if (!renamed.ok || !renamed.value.identityEvent) throw new Error('rename failed');
			await applyIdentityAttributesChangedSync(db, renamed.value.identityEvent, now);

			const badge = await loadBadgeDisplayState(db, profile.profileId);
			expect(badge.identityVerified).toBe(false);
			expect(badge.suppressed).toBe(true);
			expect(badge.suppressedReason).toBeTruthy();

			const owner = await loadOwnerProfile(db, ownerId);
			expect(owner?.identityBadgeNotice.suppressed).toBe(true);
			expect(owner?.publishState).toBe('published');

			const afterPublic = await getPublicProfile(db, profile.profileId, viewer);
			expect(afterPublic.ok).toBe(true);
			if (!afterPublic.ok) return;
			expect(afterPublic.value.displayName).toBe('Renamed Provider');
			expect(afterPublic.value.badges.identityVerified).toBe(false);

			const pendingCase = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from trust_and_safety.verification_case
				where provider_profile_id = ${profile.profileId}::uuid
				  and status = 'pending'
			`);
			expect((pendingCase as unknown as Array<{ count: number }>)[0]?.count).toBe(1);

			const searchBadge = await db.execute<{ badge_identity_verified: boolean }>(sql`
				select badge_identity_verified
				from discovery_search.search_projection
				where provider_profile_id = ${profile.profileId}::uuid
			`);
			expect(
				(searchBadge as unknown as Array<{ badge_identity_verified: boolean }>)[0]
					?.badge_identity_verified
			).toBe(false);
		});
	});

	it('finalizing a pending primary photo refreshes discovery projection photo URL', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-ponb05-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-05-photo');
			const profile = await publishMinimalProfile(db, ownerId, areaId);

			const photoRow = await db.execute<{ photo_id: string }>(sql`
				select photo_id from provider_profile.provider_photo
				where provider_profile_id = ${profile.profileId}::uuid
				  and is_primary = true
				limit 1
			`);
			const photoId = (photoRow as unknown as Array<{ photo_id: string }>)[0]?.photo_id;
			if (!photoId) throw new Error('missing primary photo');

			await db.execute(sql`
				update provider_profile.provider_photo
				set status = 'pending'
				where provider_profile_id = ${profile.profileId}::uuid
				  and photo_id = ${photoId}::uuid
			`);
			await db.execute(sql`
				update discovery_search.search_projection
				set photo_primary_url = null
				where provider_profile_id = ${profile.profileId}::uuid
			`);

			await finalizePhotoFromMediaProcessed(
				db,
				photoId as PhotoId,
				'corr-ponb-05-photo-finalize',
				new Date()
			);

			const projection = await db.execute<{ photo_primary_url: string | null }>(sql`
				select photo_primary_url
				from discovery_search.search_projection
				where provider_profile_id = ${profile.profileId}::uuid
			`);
			expect(
				(projection as unknown as Array<{ photo_primary_url: string | null }>)[0]?.photo_primary_url
			).toBeTruthy();
		});
	});
});
