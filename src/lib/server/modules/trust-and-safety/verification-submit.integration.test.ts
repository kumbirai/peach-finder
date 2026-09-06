import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import {
	seedCore,
	SEED_ADMIN_USER_ID,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { storeIdentityDoc } from '../media-processing';
import { getPublicProfile } from '../provider-profile';
import { anonymousAuth } from '../../shared/auth-context';
import { asId, type PhotoId, type UserId } from '../../shared/ids';
import { bucketSpec, consumeRateLimit } from '../../shared/rate-limit';
import {
	getOwnVerificationStatus,
	listIdentityQueue,
	resubmitVerificationClaim,
	submitVerificationClaim,
	approveVerification
} from './index';
import { verificationCases } from './infra/schema';

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
	now: Date
): Promise<[PhotoId, PhotoId]> {
	const idStored = await storeIdentityDoc(db, ownerId, await identityDocFixture('id'), now);
	const selfieStored = await storeIdentityDoc(db, ownerId, await identityDocFixture('selfie'), now);
	expect(idStored.ok).toBe(true);
	expect(selfieStored.ok).toBe(true);
	if (!idStored.ok || !selfieStored.ok) throw new Error('fixture upload failed');
	return [idStored.value.photoId, selfieStored.value.photoId];
}

describe('US-VERIF-01 submit identity claim integration', () => {
	it('TC-VERIF-01a: submission enters queue and owner sees pending status', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-01a-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);

			const submitted = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(submitted.ok).toBe(true);
			if (!submitted.ok) return;

			const status = await getOwnVerificationStatus(db, profileId);
			expect(status.status).toBe('pending');
			expect(status.caseId).toBe(submitted.value.caseId);

			const queue = await listIdentityQueue(db, now);
			expect(queue.some((item) => item.caseId === submitted.value.caseId)).toBe(true);
		});
	});

	it('TC-VERIF-01b: identity documents never appear on the public profile', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-01b-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);

			const submitted = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(submitted.ok).toBe(true);

			const profile = await getPublicProfile(db, profileId, anonymousAuth('127.0.0.1'));
			expect(profile.ok).toBe(true);
			if (!profile.ok) return;

			const serialized = JSON.stringify(profile.value);
			expect(serialized).not.toContain(idPhotoId);
			expect(serialized).not.toContain(selfiePhotoId);
			expect(serialized).not.toContain('identity-docs');
		});
	});

	it('TC-VERIF-01c: profile visibility is unchanged after submission', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-01c-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const before = await getPublicProfile(db, profileId, anonymousAuth('127.0.0.1'));
			expect(before.ok).toBe(true);
			if (!before.ok) return;

			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);
			const submitted = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(submitted.ok).toBe(true);

			const after = await getPublicProfile(db, profileId, anonymousAuth('127.0.0.1'));
			expect(after.ok).toBe(true);
			if (!after.ok) return;

			expect(after.value.displayName).toBe(before.value.displayName);
			expect(after.value.intro).toBe(before.value.intro);
			expect(after.value.badges.identityVerified).toBe(before.value.badges.identityVerified);
			expect(after.value.photos.length).toBe(before.value.photos.length);
		});
	});

	it('returns VERIFICATION_ALREADY_PENDING when an open case exists', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-dup-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);

			const first = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(first.ok).toBe(true);

			const [id2, selfie2] = await uploadIdentityDocs(db, ownerId, now);
			const duplicate = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [id2, selfie2],
				now
			});
			expect(duplicate.ok).toBe(false);
			if (duplicate.ok) return;
			expect(duplicate.error).toEqual({
				kind: 'conflict',
				reason: 'VERIFICATION_ALREADY_PENDING'
			});
		});
	});

	it('allows resubmit after rejection without orphaning prior case', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-resubmit-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);

			const first = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(first.ok).toBe(true);
			if (!first.ok) return;

			await db
				.update(verificationCases)
				.set({
					status: 'rejected',
					decidedAt: now,
					decidedBy: ownerId,
					decisionReason: 'Blurry ID photo.'
				})
				.where(eq(verificationCases.id, first.value.caseId));

			const [id2, selfie2] = await uploadIdentityDocs(db, ownerId, now);
			const resubmitted = await resubmitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [id2, selfie2],
				now: new Date(now.getTime() + 60_000)
			});
			expect(resubmitted.ok).toBe(true);
			if (!resubmitted.ok) return;

			expect(resubmitted.value.caseId).not.toBe(first.value.caseId);
			const cases = await db
				.select()
				.from(verificationCases)
				.where(eq(verificationCases.providerProfileId, profileId));
			expect(cases).toHaveLength(2);
			expect(cases.some((row) => row.status === 'rejected')).toBe(true);
			expect(cases.some((row) => row.status === 'pending')).toBe(true);
		});
	});

	it('blocks submit when identity is already approved', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-approved-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);

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
				idempotencyKey: 'verif-approved-guard',
				correlationId: 'corr-verif-approved-guard',
				now
			});
			expect(approved.ok).toBe(true);

			const [id2, selfie2] = await uploadIdentityDocs(db, ownerId, now);
			const blocked = await submitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [id2, selfie2],
				now: new Date(now.getTime() + 60_000)
			});
			expect(blocked.ok).toBe(false);
			if (blocked.ok) return;
			expect(blocked.error).toEqual({
				kind: 'conflict',
				reason: 'Your identity is already verified.'
			});
		});
	});

	it('blocks resubmit when there has been no prior rejection', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-verif-resubmit-guard-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const profileId = asId<'ProviderProfileId'>(SEED_DUAL_ROLE_PROFILE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const [idPhotoId, selfiePhotoId] = await uploadIdentityDocs(db, ownerId, now);

			const blocked = await resubmitVerificationClaim(db, {
				ownerId,
				providerProfileId: profileId,
				docPhotoIds: [idPhotoId, selfiePhotoId],
				now
			});
			expect(blocked.ok).toBe(false);
			if (blocked.ok) return;
			expect(blocked.error).toEqual({
				kind: 'precondition_failed',
				reason: 'You need a rejected submission before you can resubmit.'
			});
		});
	});

	it('rate limits verification submit after five attempts per hour', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const ownerId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');
			const spec = bucketSpec('verification_submit');

			for (let i = 0; i < 5; i++) {
				const allowed = await consumeRateLimit(db, spec, `account:${ownerId}`, now);
				expect(allowed.ok).toBe(true);
			}

			const blocked = await consumeRateLimit(db, spec, `account:${ownerId}`, now);
			expect(blocked.ok).toBe(false);
			if (blocked.ok) return;
			expect(blocked.error.kind).toBe('rate_limited');
		});
	});
});
