import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { anonymousAuth, createAuthContext } from '../../shared/auth-context';
import type { AreaId, UserId } from '../../shared/ids';
import { asId } from '../../shared/ids';
import {
	addService,
	attachOnboardingPhoto,
	createDraftProfile,
	getPublicProfile,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
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
			displayName: 'Phone Visibility Test',
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
	await updateIntro(db, ownerId, 'Phone visibility integration intro.', crypto.randomUUID(), now);
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

describe('US-PONB-07 phone visibility', () => {
	it('TC-PONB-07a: defaults OFF and omits phone from anonymous API response', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb07a');
			const profile = await publishMinimalProfile(db, ownerId, areaId);

			expect(profile.phoneVisible).toBe(false);

			const anonymous = await getPublicProfile(db, profile.profileId, anonymousAuth('127.0.0.1'));
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile read failed');

			expect(anonymous.value.phone).toBeUndefined();
			expect(JSON.stringify(anonymous.value)).not.toContain('+27');
		});
	});

	it('TC-PONB-07b: ON reveals phone to anonymous visitors', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb07b');
			const profile = await publishMinimalProfile(db, ownerId, areaId);

			const updated = await updatePhoneVisibility(db, ownerId, true, 'corr-phone-on', new Date());
			expect(updated.ok).toBe(true);

			const owner = await loadOwnerProfile(db, ownerId);
			expect(owner?.phoneVisible).toBe(true);

			const anonymous = await getPublicProfile(db, profile.profileId, anonymousAuth('127.0.0.1'));
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile read failed');
			expect(anonymous.value.phone).toMatch(/^\+27/);
		});
	});

	it('TC-PONB-07c: signed-in seekers see phone when setting is OFF', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb07c');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			expect(profile.phoneVisible).toBe(false);

			const seeker = createAuthContext({
				userId: asId<'UserId'>('01900000-0000-7000-8000-000000000099'),
				role: 'seeker',
				sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000701'),
				ipAddress: '127.0.0.1'
			});

			const signedIn = await getPublicProfile(db, profile.profileId, seeker);
			expect(signedIn.ok).toBe(true);
			if (!signedIn.ok) throw new Error('profile read failed');
			expect(signedIn.value.phone).toMatch(/^\+27/);

			const anonymous = await getPublicProfile(db, profile.profileId, anonymousAuth('127.0.0.1'));
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile read failed');
			expect(anonymous.value.phone).toBeUndefined();
		});
	});

	it('idempotent toggle OFF after ON hides phone from anonymous again', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb07-idem');
			const profile = await publishMinimalProfile(db, ownerId, areaId);

			await updatePhoneVisibility(db, ownerId, true, 'corr-on', new Date());
			await updatePhoneVisibility(db, ownerId, false, 'corr-off', new Date());

			const anonymous = await getPublicProfile(db, profile.profileId, anonymousAuth('127.0.0.1'));
			expect(anonymous.ok).toBe(true);
			if (!anonymous.ok) throw new Error('profile read failed');
			expect(anonymous.value.phone).toBeUndefined();
		});
	});
});
