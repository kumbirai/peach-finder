import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { hashSessionToken } from '../identity-and-access';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { sessions } from '../identity-and-access/infra/schema';
import {
	addService,
	attachOnboardingPhoto,
	createDraftProfile,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
	updateArea,
	updateIntro
} from '../provider-profile';
import {
	getAvailabilityTransparencyForOwner,
	setAvailabilityForOwner
} from '../provider-availability';
import type { AreaId, UserId } from '../../shared/ids';
import { newId } from '../../shared/ids';

async function registerVerifiedProvider(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	areaId: AreaId,
	label: string,
	now: Date
): Promise<UserId> {
	const reg = await registerProvider(
		db,
		{
			email: `${label}-${Date.now()}@example.com`,
			password: 'password123',
			displayName: `Transparency ${label}`,
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
	areaId: AreaId,
	now: Date
) {
	await createDraftProfile(db, ownerId, areaId);
	await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
	await updateIntro(db, ownerId, 'Transparency integration profile.', crypto.randomUUID(), now);
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
}

describe('getAvailabilityTransparencyForOwner', () => {
	it('returns availability expiry and the four active-this-week signals', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			const now = new Date('2026-09-06T12:00:00.000Z');
			const ownerId = await registerVerifiedProvider(db, areaId, 'transparency', now);
			await db.insert(sessions).values({
				id: newId(),
				userId: ownerId,
				tokenHash: hashSessionToken(`transparency-${Date.now()}`),
				createdAt: now,
				lastSeenAt: now,
				expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
				ipAddress: '127.0.0.1'
			});
			await publishMinimalProfile(db, ownerId, areaId, now);

			const set = await setAvailabilityForOwner(db, ownerId, 'corr-set', now);
			expect(set.ok).toBe(true);

			const result = await getAvailabilityTransparencyForOwner(db, ownerId, now);
			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.value.availability.state).toBe('available');
			expect(result.value.availability.expiresAt).toBeTruthy();
			expect(result.value.availability.expiresInSeconds).toBeGreaterThan(0);
			expect(result.value.activeThisWeek.signals.signedIn).toBe(true);
			expect(result.value.activeThisWeek.signals.availabilitySet).toBe(true);
			expect(result.value.activeThisWeek.signals.availabilitySetCount).toBeGreaterThan(0);
			expect(result.value.activeThisWeek.qualifies).toBe(true);
			expect(result.value.activeThisWeek.sinceIso).toBe(
				new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
			);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile).toBeTruthy();
			const badgeRows = await db.execute<{ active_this_week: boolean }>(sql`
				select active_this_week
				from trust_and_safety.badge_state
				where provider_profile_id = ${profile!.profileId}::uuid
			`);
			expect(badgeRows[0]?.active_this_week ?? false).toBe(result.value.activeThisWeek.badgeActive);
		});
	});
});
