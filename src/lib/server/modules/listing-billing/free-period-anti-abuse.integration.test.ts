import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { seedCore } from '../../../../../scripts/seed-core';
import { registerProvider, verifyOtp, deleteAccount } from '../identity-and-access';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { createSession } from '../identity-and-access/infra/session-commands';
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
import { getBillingStatusForOwner } from '../listing-billing';
import { handlePhoneVerifiedForTrialEligibility } from '../listing-billing/infra/trial-eligibility-handler';
import { wasPhoneUsedBefore, getPhoneVerifiedAt } from '../identity-and-access';
import { hashPhone } from '../identity-and-access/infra/phone-hash';
import type { AreaId, UserId } from '../../shared/ids';

const PASSWORD = 'password123';

async function registerVerifiedProvider(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	areaId: AreaId,
	label: string,
	phone: string
): Promise<UserId> {
	const now = new Date();
	const reg = await registerProvider(
		db,
		{
			email: `${label}-${Date.now()}@example.com`,
			password: PASSWORD,
			displayName: 'Billing Anti-Abuse',
			phone,
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

async function preparePublishableProfile(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	ownerId: UserId,
	areaId: AreaId,
	now: Date
): Promise<void> {
	await createDraftProfile(db, ownerId, areaId);
	await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
	await updateIntro(
		db,
		ownerId,
		'Licensed therapist focused on sports recovery.',
		crypto.randomUUID(),
		now
	);
	await addService(
		db,
		ownerId,
		{ name: 'Deep tissue', durationMinutes: 60, priceCents: 45000 },
		crypto.randomUUID(),
		now
	);
	await setLanguages(db, ownerId, ['en'], crypto.randomUUID(), now);
	await updateArea(db, ownerId, areaId, crypto.randomUUID(), now);
}

async function deleteProviderAccount(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	userId: UserId,
	now: Date
): Promise<void> {
	const { sessionId } = await createSession(db, {
		userId,
		ipAddress: '127.0.0.1',
		userAgent: 'test',
		now
	});
	const deleted = await deleteAccount(
		db,
		{ userId, sessionId, password: PASSWORD, confirm: true },
		now,
		'corr-delete'
	);
	expect(deleted.ok).toBe(true);
}

describe('US-BILL-02 free period anti-abuse integration', () => {
	it('TC-BILL-02a: re-registration resumes prior trial end instead of granting a fresh period', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			const sharedPhone = `+2781${String(Date.now()).slice(-7)}`;

			const firstPublishAt = new Date('2026-09-05T10:00:00.000Z');
			const secondPublishAt = new Date('2026-09-10T10:00:00.000Z');

			const firstOwnerId = await registerVerifiedProvider(
				db,
				areaId,
				'bill-02a-first',
				sharedPhone
			);
			await preparePublishableProfile(db, firstOwnerId, areaId, firstPublishAt);
			const firstPublished = await publishProfileForOwner(
				db,
				firstOwnerId,
				'corr-bill-02a-first',
				firstPublishAt
			);
			expect(firstPublished.ok, JSON.stringify(firstPublished)).toBe(true);

			const firstProfile = await loadOwnerProfile(db, firstOwnerId);
			const originalTrialEndsAt = firstProfile?.listing?.trialEndsAt;
			expect(originalTrialEndsAt).toBeTruthy();

			const priorListingRows = await db.execute<{ phone_history_ref: string | null }>(sql`
				select phone_history_ref from listing_billing.listing
				where provider_profile_id = ${firstProfile!.profileId}::uuid
			`);
			expect(
				(priorListingRows as unknown as Array<{ phone_history_ref: string | null }>)[0]
					?.phone_history_ref
			).toBeTruthy();

			await deleteProviderAccount(db, firstOwnerId, secondPublishAt);

			const secondOwnerId = await registerVerifiedProvider(
				db,
				areaId,
				'bill-02a-second',
				sharedPhone
			);
			await preparePublishableProfile(db, secondOwnerId, areaId, secondPublishAt);
			const secondPublished = await publishProfileForOwner(
				db,
				secondOwnerId,
				'corr-bill-02a-second',
				secondPublishAt
			);
			expect(secondPublished.ok).toBe(true);

			const secondProfile = await loadOwnerProfile(db, secondOwnerId);
			expect(secondProfile?.listing?.state).toBe('free_listed');
			expect(secondProfile?.listing?.trialEndsAt).toBe(originalTrialEndsAt);
			expect(secondProfile?.listing?.trialStartedAt).not.toBe(secondPublishAt.toISOString());

			const billing = await getBillingStatusForOwner(db, secondOwnerId);
			expect(billing?.billingContinuity).toBe('resumed');
			expect(billing?.dashboard?.billingContinuity).toBe('resumed');
		});
	});

	it('TC-BILL-02a: phone reuse without a prior published listing enters payment-required grace', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			const sharedPhone = `+2782${String(Date.now()).slice(-7)}`;

			const verifyAt = new Date('2026-09-01T10:00:00.000Z');
			const publishAt = new Date('2026-09-05T10:00:00.000Z');

			const firstOwnerId = await registerVerifiedProvider(
				db,
				areaId,
				'bill-02a-verify',
				sharedPhone
			);
			const firstVerifiedAt = await getPhoneVerifiedAt(db, firstOwnerId);
			expect(await wasPhoneUsedBefore(db, hashPhone(sharedPhone), firstVerifiedAt!)).toBe(false);

			await createDraftProfile(db, firstOwnerId, areaId);
			await handlePhoneVerifiedForTrialEligibility(
				db,
				firstOwnerId,
				hashPhone(sharedPhone),
				firstVerifiedAt!
			);
			await deleteProviderAccount(db, firstOwnerId, verifyAt);

			const secondOwnerId = await registerVerifiedProvider(
				db,
				areaId,
				'bill-02a-publish',
				sharedPhone
			);
			const secondVerifiedAt = await getPhoneVerifiedAt(db, secondOwnerId);
			expect(await wasPhoneUsedBefore(db, hashPhone(sharedPhone), secondVerifiedAt!)).toBe(true);

			await preparePublishableProfile(db, secondOwnerId, areaId, publishAt);
			const published = await publishProfileForOwner(
				db,
				secondOwnerId,
				'corr-bill-02a-payment',
				publishAt
			);
			expect(published.ok).toBe(true);

			const listingRows = await db.execute<{
				state: string;
				trial_ends_at: string | null;
				billing_continuity: string;
			}>(sql`
				select state, trial_ends_at, billing_continuity
				from listing_billing.listing
				where provider_profile_id = ${(await loadOwnerProfile(db, secondOwnerId))!.profileId}::uuid
			`);
			const listing = (
				listingRows as unknown as Array<{
					state: string;
					trial_ends_at: string | null;
					billing_continuity: string;
				}>
			)[0];
			expect(listing?.state).toBe('grace');
			expect(listing?.trial_ends_at).toBeNull();
			expect(listing?.billing_continuity).toBe('no_trial');

			const billing = await getBillingStatusForOwner(db, secondOwnerId);
			expect(billing?.dashboard?.whatHappensNext).toContain(
				'already used for a free listing period'
			);
		});
	});

	it('TC-BILL-02b: resumed-state messaging is plain and not accusatory', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;
			const sharedPhone = `+2783${String(Date.now()).slice(-7)}`;

			const firstPublishAt = new Date('2026-09-05T10:00:00.000Z');
			const secondPublishAt = new Date('2026-09-10T10:00:00.000Z');

			const firstOwnerId = await registerVerifiedProvider(
				db,
				areaId,
				'bill-02b-first',
				sharedPhone
			);
			await preparePublishableProfile(db, firstOwnerId, areaId, firstPublishAt);
			await publishProfileForOwner(db, firstOwnerId, 'corr-bill-02b-first', firstPublishAt);
			await deleteProviderAccount(db, firstOwnerId, secondPublishAt);

			const secondOwnerId = await registerVerifiedProvider(
				db,
				areaId,
				'bill-02b-second',
				sharedPhone
			);
			await preparePublishableProfile(db, secondOwnerId, areaId, secondPublishAt);
			await publishProfileForOwner(db, secondOwnerId, 'corr-bill-02b-second', secondPublishAt);

			const billing = await getBillingStatusForOwner(db, secondOwnerId);
			const copy = billing?.dashboard?.whatHappensNext ?? '';
			expect(copy).toContain('continues from your previous account');
			expect(copy.toLowerCase()).not.toMatch(/abuse|fraud|violation|cheat/);
		});
	});
});
