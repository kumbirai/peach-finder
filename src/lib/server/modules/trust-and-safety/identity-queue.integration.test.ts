import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { SEED_ADMIN_USER_ID } from '../../../../../scripts/seed-core';
import {
	SEED_VERIF_PENDING_NEW_CASE_ID,
	SEED_VERIF_PENDING_NEW_OWNER_ID,
	SEED_VERIF_PENDING_NEW_PROFILE_ID,
	SEED_VERIF_PENDING_OLD_CASE_ID
} from '../../../../../scripts/seed-verification-constants';
import { seedVerification } from '../../../../../scripts/seed-verification';
import { asId } from '../../shared/ids';
import { auditLog, outbox } from '../../shared/schema';
import { unpublishProfileForOwnerDb } from '../provider-profile';
import {
	approveVerification,
	getIdentityQueueStats,
	listIdentityQueue,
	rejectVerification,
	verificationCaseReferencesPhoto
} from './index';
import {
	IDENTITY_DOC_PRESIGN_TTL_MS,
	issueIdentityDocUrl,
	verifyIdentityDocPresign
} from '../media-processing';
import { verificationCases, badgeState } from './infra/schema';
import { handleVerificationDecided } from '../user-notifications';
import { notificationLog } from '../user-notifications/infra/schema';

describe('US-ADMIN-02 identity queue integration', () => {
	it('TC-ADMIN-02a: pending cases are oldest-first with profile context and docs', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-admin02-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const queue = await listIdentityQueue(db, now);
			expect(queue.length).toBeGreaterThanOrEqual(2);
			expect(queue[0]!.caseId).toBe(SEED_VERIF_PENDING_OLD_CASE_ID);
			expect(queue[1]!.caseId).toBe(SEED_VERIF_PENDING_NEW_CASE_ID);
			expect(queue[0]!.overdue).toBe(true);
			expect(queue[0]!.docPhotoIds.length).toBe(2);
			expect(queue[0]!.profile.displayName).toBeTruthy();
			expect(queue[0]!.profile.intro.length).toBeGreaterThan(0);

			const stats = await getIdentityQueueStats(db, now);
			expect(stats.pendingCount).toBeGreaterThanOrEqual(2);
		});
	});

	it('TC-ADMIN-02b: presigned identity doc URLs expire after five minutes', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-admin02b-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			const queue = await listIdentityQueue(db, new Date('2026-09-06T12:00:00.000Z'));
			const photoId = asId<'PhotoId'>(queue[0]!.docPhotoIds[0]!);
			const issuedAt = new Date('2026-09-06T12:00:00.000Z');
			const issued = await issueIdentityDocUrl(db, {
				photoId,
				adminId: asId<'UserId'>(SEED_ADMIN_USER_ID),
				correlationId: 'test-presign',
				now: issuedAt
			});
			expect(issued.ok).toBe(true);
			if (!issued.ok) return;

			const expiredAt = new Date(issuedAt.getTime() + IDENTITY_DOC_PRESIGN_TTL_MS + 1);
			const url = new URL(issued.value.url);
			const exp = Number(url.searchParams.get('exp'));
			const sig = url.searchParams.get('sig') ?? '';
			expect(verifyIdentityDocPresign(photoId, exp, sig, issuedAt)).toBe(true);
			expect(verifyIdentityDocPresign(photoId, exp, sig, expiredAt)).toBe(false);

			const audits = await db
				.select()
				.from(auditLog)
				.where(
					and(
						eq(auditLog.action, 'media-processing.identity_doc_presign'),
						eq(auditLog.targetId, photoId)
					)
				);
			expect(audits.length).toBe(1);
		});
	});

	it('TC-ADMIN-02c: approve writes audit log and notifies provider', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-admin02c-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const caseId = asId<'VerificationCaseId'>(SEED_VERIF_PENDING_OLD_CASE_ID);
			const now = new Date('2026-09-06T12:00:00.000Z');

			const approved = await approveVerification(db, {
				caseId,
				adminId,
				reason: null,
				idempotencyKey: 'approve-once',
				correlationId: 'corr-approve',
				now
			});
			expect(approved.ok).toBe(true);
			if (!approved.ok) return;

			const audits = await db
				.select()
				.from(auditLog)
				.where(and(eq(auditLog.action, 'identity.approve'), eq(auditLog.targetId, caseId)));
			expect(audits).toHaveLength(1);

			const events = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'VerificationDecided'));
			expect(
				events.some((event) => (event.payload as { decision?: string }).decision === 'approved')
			).toBe(true);

			const decided = events.find(
				(event) => (event.payload as { verificationCaseId?: string }).verificationCaseId === caseId
			);
			expect(decided).toBeTruthy();
			if (decided) {
				await handleVerificationDecided(db, decided as never);
			}

			const badge = await db
				.select()
				.from(badgeState)
				.where(eq(badgeState.providerProfileId, approved.value.providerProfileId))
				.limit(1);
			expect(badge[0]?.identityVerified).toBe(true);

			const notifications = await db
				.select()
				.from(notificationLog)
				.where(eq(notificationLog.category, 'identity_outcome'));
			expect(notifications.length).toBeGreaterThan(0);
		});
	});

	it('includes pending cases even when the provider profile is unpublished', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-admin02e-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			await unpublishProfileForOwnerDb(
				db,
				asId<'UserId'>(SEED_VERIF_PENDING_NEW_OWNER_ID),
				'owner',
				'corr-unpublish-for-queue',
				new Date('2026-09-06T12:00:00.000Z')
			);

			const queue = await listIdentityQueue(db, new Date('2026-09-06T12:00:00.000Z'));
			expect(queue.some((item) => item.caseId === SEED_VERIF_PENDING_NEW_CASE_ID)).toBe(true);
			const pending = queue.find((item) => item.caseId === SEED_VERIF_PENDING_NEW_CASE_ID);
			expect(pending?.providerProfileId).toBe(SEED_VERIF_PENDING_NEW_PROFILE_ID);
			expect(pending?.profile.displayName).toBeTruthy();
		});
	});

	it('presign is allowed only for photos on pending verification cases', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-admin02f-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			const queue = await listIdentityQueue(db, new Date('2026-09-06T12:00:00.000Z'));
			const photoId = queue[0]!.docPhotoIds[0]!;
			expect(await verificationCaseReferencesPhoto(db, photoId)).toBe(true);

			const approved = await approveVerification(db, {
				caseId: asId<'VerificationCaseId'>(SEED_VERIF_PENDING_OLD_CASE_ID),
				adminId: asId<'UserId'>(SEED_ADMIN_USER_ID),
				reason: null,
				idempotencyKey: 'presign-scope',
				correlationId: 'corr-presign-scope',
				now: new Date('2026-09-06T12:00:00.000Z')
			});
			expect(approved.ok).toBe(true);

			expect(await verificationCaseReferencesPhoto(db, photoId)).toBe(false);
		});
	});

	it('reject requires a reason and removes the case from the pending queue', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-media-admin02d-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);

			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const caseId = asId<'VerificationCaseId'>(SEED_VERIF_PENDING_NEW_CASE_ID);
			const blocked = await rejectVerification(db, {
				caseId,
				adminId,
				reason: '   ',
				idempotencyKey: 'reject-empty',
				correlationId: 'corr-reject-empty',
				now: new Date()
			});
			expect(blocked.ok).toBe(false);

			const rejected = await rejectVerification(db, {
				caseId,
				adminId,
				reason: 'Selfie did not match the ID photo.',
				idempotencyKey: 'reject-once',
				correlationId: 'corr-reject',
				now: new Date()
			});
			expect(rejected.ok).toBe(true);

			const row = await db
				.select()
				.from(verificationCases)
				.where(eq(verificationCases.id, caseId))
				.limit(1);
			expect(row[0]?.status).toBe('rejected');
			expect(row[0]?.decisionReason).toContain('Selfie');
		});
	});
});
