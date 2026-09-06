import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { applyIdentityAttributesChangedSync } from '../../shared/identity-change-sync';
import { anonymousAuth } from '../../shared/auth-context';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { newId, type AreaId, type ProviderProfileId, type UserId } from '../../shared/ids';
import {
	createDraftProfile,
	getPublicProfile,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
	addService,
	updateArea,
	updateIntro,
	attachOnboardingPhoto
} from '../provider-profile';
import {
	BADGE_SUPPRESSION_REASON,
	grantIdentityBadgeDev,
	handleIdentityAttributesChanged,
	loadBadgeDisplayState,
	loadOwnerBadgeNotice
} from './index';
import { badgeState } from './infra/schema';

async function registerVerifiedProvider(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	areaId: AreaId,
	label: string
): Promise<{ ownerId: UserId; profileId: ProviderProfileId }> {
	const now = new Date();
	const reg = await registerProvider(
		db,
		{
			email: `${label}-${Date.now()}@example.com`,
			password: 'password123',
			displayName: 'Verified Suppression Test',
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

	const ownerId = verified.value.userId as UserId;
	await createDraftProfile(db, ownerId, areaId);
	await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
	await updateIntro(
		db,
		ownerId,
		'Profile stays live during badge suppression.',
		crypto.randomUUID(),
		now
	);
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
	return { ownerId, profileId: profile.profileId };
}

function phoneChangeEvent(userId: UserId, correlationId: string, now: Date) {
	return {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'IdentityAttributesChanged' as const,
		version: 1 as const,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: { userId, changedFields: ['phone'] }
	};
}

describe('US-VERIF-03 badge suppression on identity-relevant changes', () => {
	it('TC-VERIF-03a: phone change suppresses badge without revoking verification or profile visibility', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const { ownerId, profileId } = await registerVerifiedProvider(db, areaId, 'verif-03a');
			await grantIdentityBadgeDev(db, profileId, new Date());

			const beforeBadge = await loadBadgeDisplayState(db, profileId);
			expect(beforeBadge.identityVerified).toBe(true);
			expect(beforeBadge.suppressed).toBe(false);

			const viewer = anonymousAuth('127.0.0.1');
			const beforePublic = await getPublicProfile(db, profileId, viewer);
			expect(beforePublic.ok).toBe(true);
			if (!beforePublic.ok) return;
			expect(beforePublic.value.badges.identityVerified).toBe(true);

			const now = new Date();
			const event = phoneChangeEvent(ownerId, 'corr-verif-03a-phone', now);
			await applyIdentityAttributesChangedSync(db, event, now);

			const rawBadge = await db
				.select({
					identityVerified: badgeState.identityVerified,
					suppressed: badgeState.suppressed,
					suppressedReason: badgeState.suppressedReason
				})
				.from(badgeState)
				.where(eq(badgeState.providerProfileId, profileId))
				.limit(1);
			expect(rawBadge[0]?.identityVerified).toBe(true);
			expect(rawBadge[0]?.suppressed).toBe(true);
			expect(rawBadge[0]?.suppressedReason).toBe(BADGE_SUPPRESSION_REASON);

			const display = await loadBadgeDisplayState(db, profileId);
			expect(display.identityVerified).toBe(false);
			expect(display.suppressed).toBe(true);

			const notice = await loadOwnerBadgeNotice(db, profileId);
			expect(notice.suppressed).toBe(true);
			expect(notice.message).toContain('re-checks');

			const owner = await loadOwnerProfile(db, ownerId);
			expect(owner?.publishState).toBe('published');
			expect(owner?.identityBadgeNotice.suppressed).toBe(true);

			const afterPublic = await getPublicProfile(db, profileId, viewer);
			expect(afterPublic.ok).toBe(true);
			if (!afterPublic.ok) return;
			expect(afterPublic.value.badges.identityVerified).toBe(false);

			const pendingCase = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from trust_and_safety.verification_case
				where provider_profile_id = ${profileId}::uuid
				  and status = 'pending'
			`);
			expect((pendingCase as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});

	it('TC-VERIF-03a: redelivered IdentityAttributesChanged is idempotent (one pending case)', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const { ownerId, profileId } = await registerVerifiedProvider(db, areaId, 'verif-03a-idem');
			await grantIdentityBadgeDev(db, profileId, new Date());

			const now = new Date();
			const event = phoneChangeEvent(ownerId, 'corr-verif-03a-idem', now);
			await handleIdentityAttributesChanged(db, event);
			await handleIdentityAttributesChanged(db, event);

			const pendingCase = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from trust_and_safety.verification_case
				where provider_profile_id = ${profileId}::uuid
				  and status = 'pending'
			`);
			expect((pendingCase as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});

	it('TC-VERIF-03a: non-identity field changes do not suppress the badge', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const { ownerId, profileId } = await registerVerifiedProvider(db, areaId, 'verif-03a-skip');
			await grantIdentityBadgeDev(db, profileId, new Date());

			const now = new Date();
			const event: DomainEvent<
				'IdentityAttributesChanged',
				{ userId: string; changedFields: string[] }
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'IdentityAttributesChanged',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId: 'corr-verif-03a-skip',
				payload: { userId: ownerId, changedFields: ['email'] }
			};
			await handleIdentityAttributesChanged(db, event);

			const display = await loadBadgeDisplayState(db, profileId);
			expect(display.identityVerified).toBe(true);
			expect(display.suppressed).toBe(false);
		});
	});
});
