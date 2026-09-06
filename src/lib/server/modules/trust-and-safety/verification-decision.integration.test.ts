import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_ADMIN_USER_ID,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID
} from '../../../../../scripts/seed-core';
import {
	SEED_VERIF_PENDING_NEW_PROFILE_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID
} from '../../../../../scripts/seed-verification-constants';
import { seedVerification } from '../../../../../scripts/seed-verification';
import { runSearch } from '../discovery-search';
import { getPublicProfile } from '../provider-profile';
import { anonymousAuth } from '../../shared/auth-context';
import { asId, type PhotoId, type UserId } from '../../shared/ids';
import { outbox } from '../../shared/schema';
import { storeIdentityDoc } from '../media-processing';
import sharp from 'sharp';
import {
	approveVerification,
	getOwnVerificationStatus,
	loadBadgeDisplayState,
	rejectVerification,
	resubmitVerificationClaim,
	submitVerificationClaim
} from './index';
import { handleVerificationDecided } from '../user-notifications';
import { notificationLog } from '../user-notifications/infra/schema';

async function identityDocFixture(label: string): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
		<rect width="100%" height="100%" fill="#f5f0eb"/>
		<text x="8" y="24" font-family="sans-serif" font-size="12">${label}</text>
	</svg>`;
	return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function uploadIdentityDocs(
	db: Parameters<typeof storeIdentityDoc>[0],
	ownerId: UserId,
	now: Date,
	label: string
): Promise<[PhotoId, PhotoId]> {
	const idStored = await storeIdentityDoc(
		db,
		ownerId,
		await identityDocFixture(`${label}-id`),
		now
	);
	const selfieStored = await storeIdentityDoc(
		db,
		ownerId,
		await identityDocFixture(`${label}-selfie`),
		now
	);
	expect(idStored.ok).toBe(true);
	expect(selfieStored.ok).toBe(true);
	if (!idStored.ok || !selfieStored.ok) throw new Error('fixture upload failed');
	return [idStored.value.photoId, selfieStored.value.photoId];
}

describe('US-VERIF-02 a human decides; the badge follows', () => {
	it('TC-VERIF-02a: pending submissions never render the identity badge on profile or search', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-02a-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			for (const profileId of [
				SEED_VERIF_PENDING_OLD_PROFILE_ID,
				SEED_VERIF_PENDING_NEW_PROFILE_ID
			]) {
				const typedProfileId = asId<'ProviderProfileId'>(profileId);
				const badge = await loadBadgeDisplayState(db, typedProfileId);
				expect(badge.identityVerified).toBe(false);

				const profile = await getPublicProfile(db, typedProfileId, anonymousAuth('127.0.0.1'));
				expect(profile.ok).toBe(true);
				if (!profile.ok) return;
				expect(profile.value.badges.identityVerified).toBe(false);
			}

			const search = await runSearch(db, { lexicon: [], limit: 50 }, anonymousAuth('127.0.0.1'));
			const lerato = search.cards.find(
				(card) => card.providerProfileId === SEED_VERIF_PENDING_OLD_PROFILE_ID
			);
			expect(lerato).toBeTruthy();
			expect(lerato?.badges.identityVerified).toBe(false);

			const zanele = search.cards.find(
				(card) => card.providerProfileId === SEED_VERIF_PENDING_NEW_PROFILE_ID
			);
			expect(zanele).toBeTruthy();
			expect(zanele?.badges.identityVerified).toBe(false);
		});
	});

	it('TC-VERIF-02b: approval grants the badge and notifies; rejection returns reason and allows resubmit', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-02b-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now, 'verif-02b');

			const submitted = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(submitted.ok).toBe(true);
			if (!submitted.ok) return;

			const pendingBadge = await loadBadgeDisplayState(db, profileId);
			expect(pendingBadge.identityVerified).toBe(false);

			const rejected = await rejectVerification(db, {
				caseId: submitted.value.caseId,
				adminId,
				reason: 'Selfie did not match the ID photo.',
				idempotencyKey: 'verif-02b-reject',
				correlationId: 'corr-verif-02b-reject',
				now: new Date(now.getTime() + 60_000)
			});
			expect(rejected.ok).toBe(true);

			const rejectedStatus = await getOwnVerificationStatus(db, profileId);
			expect(rejectedStatus.status).toBe('rejected');
			expect(rejectedStatus.rejectionReason).toContain('Selfie did not match');

			const rejectEvents = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'VerificationDecided'));
			const rejectEvent = rejectEvents.find(
				(event) =>
					(event.payload as { verificationCaseId?: string }).verificationCaseId ===
					submitted.value.caseId
			);
			expect(rejectEvent).toBeTruthy();
			if (rejectEvent) {
				await handleVerificationDecided(db, rejectEvent as never);
			}

			const rejectNotifications = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.category, 'identity_outcome'));
			expect(rejectNotifications.length).toBeGreaterThan(0);

			const [id2, selfie2] = await uploadIdentityDocs(
				db,
				ownerId,
				new Date(now.getTime() + 120_000),
				'verif-02b-resubmit'
			);
			const resubmitted = await resubmitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [id2, selfie2],
				now: new Date(now.getTime() + 180_000)
			});
			expect(resubmitted.ok).toBe(true);
			if (!resubmitted.ok) return;

			const approved = await approveVerification(db, {
				caseId: resubmitted.value.caseId,
				adminId,
				reason: null,
				idempotencyKey: 'verif-02b-approve',
				correlationId: 'corr-verif-02b-approve',
				now: new Date(now.getTime() + 240_000)
			});
			expect(approved.ok).toBe(true);

			const badge = await loadBadgeDisplayState(db, profileId);
			expect(badge.identityVerified).toBe(true);

			const profile = await getPublicProfile(db, profileId, anonymousAuth('127.0.0.1'));
			expect(profile.ok).toBe(true);
			if (!profile.ok) return;
			expect(profile.value.badges.identityVerified).toBe(true);

			const approveEvents = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'VerificationDecided'));
			const approveEvent = approveEvents.find(
				(event) =>
					(event.payload as { verificationCaseId?: string }).verificationCaseId ===
						resubmitted.value.caseId &&
					(event.payload as { decision?: string }).decision === 'approved'
			);
			expect(approveEvent).toBeTruthy();
			if (approveEvent) {
				await handleVerificationDecided(db, approveEvent as never);
			}

			const approvedStatus = await getOwnVerificationStatus(db, profileId);
			expect(approvedStatus.status).toBe('approved');

			const notifications = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.category, 'identity_outcome'));
			expect(notifications.length).toBeGreaterThanOrEqual(2);
		});
	});

	it('seedVerification resets dual-role badge after a prior approval for repeatable E2E', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-02-seed-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now, 'verif-seed');

			const submitted = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(submitted.ok).toBe(true);
			if (!submitted.ok) return;

			const approved = await approveVerification(db, {
				caseId: submitted.value.caseId,
				adminId,
				reason: null,
				idempotencyKey: 'verif-seed-approve',
				correlationId: 'corr-verif-seed-approve',
				now: new Date(now.getTime() + 60_000)
			});
			expect(approved.ok).toBe(true);

			const verifiedBeforeReseed = await loadBadgeDisplayState(db, profileId);
			expect(verifiedBeforeReseed.identityVerified).toBe(true);

			await seedVerification(db);

			const badge = await loadBadgeDisplayState(db, profileId);
			expect(badge.identityVerified).toBe(false);

			const status = await getOwnVerificationStatus(db, profileId);
			expect(status.status).toBe('never_submitted');
		});
	});
});
