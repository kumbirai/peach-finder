import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_ADMIN_USER_ID } from '../../../../../scripts/seed-core';
import {
	SEED_VERIF_PENDING_NEW_OWNER_ID,
	SEED_VERIF_PENDING_NEW_PROFILE_ID,
	SEED_VERIF_PENDING_OLD_OWNER_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID
} from '../../../../../scripts/seed-verification-constants';
import { seedVerification } from '../../../../../scripts/seed-verification';
import { asId, newId, type PhotoId, type UserId } from '../../shared/ids';
import { storeIdentityDoc } from '../media-processing';
import { photos } from '../media-processing/infra/schema';
import { IDENTITY_DOC_RETENTION_MS } from './domain/identity-doc-retention';
import { runIdentityDocPurgeJob } from './index';
import { verificationCases } from './infra/schema';

async function identityDocFixture(label: string): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
		<rect width="100%" height="100%" fill="#f5f0eb"/>
		<text x="8" y="24" font-family="sans-serif" font-size="12">${label}</text>
	</svg>`;
	return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function uploadIdentityDoc(
	db: Parameters<typeof storeIdentityDoc>[0],
	ownerId: UserId,
	now: Date,
	label: string
): Promise<PhotoId> {
	const stored = await storeIdentityDoc(db, ownerId, await identityDocFixture(label), now);
	expect(stored.ok).toBe(true);
	if (!stored.ok) throw new Error('fixture upload failed');
	return stored.value.photoId;
}

describe('US-PRIV-03 identity-doc purge integration', () => {
	it('TC-PRIV-03a: identity docs purge at 90 days post-decision, not at 89 days', async () => {
		await withTestDatabase(async (db) => {
			process.env.MEDIA_LOCAL_ROOT = `/tmp/peach-priv-03a-${Date.now()}`;
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			await seedVerification(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const dueOwnerId = asId<'UserId'>(SEED_VERIF_PENDING_OLD_OWNER_ID);
			const holdOwnerId = asId<'UserId'>(SEED_VERIF_PENDING_NEW_OWNER_ID);
			const dueProfileId = asId<'ProviderProfileId'>(SEED_VERIF_PENDING_OLD_PROFILE_ID);
			const holdProfileId = asId<'ProviderProfileId'>(SEED_VERIF_PENDING_NEW_PROFILE_ID);
			const adminId = asId<'UserId'>(SEED_ADMIN_USER_ID);
			const decidedAt90 = new Date(now.getTime() - IDENTITY_DOC_RETENTION_MS);
			const decidedAt89 = new Date(now.getTime() - IDENTITY_DOC_RETENTION_MS + 24 * 60 * 60_000);

			const duePhotoId = await uploadIdentityDoc(db, dueOwnerId, decidedAt90, 'due');
			const holdPhotoId = await uploadIdentityDoc(db, holdOwnerId, decidedAt89, 'hold');
			const dueCaseId = newId<'VerificationCaseId'>();
			const holdCaseId = newId<'VerificationCaseId'>();

			await db.insert(verificationCases).values([
				{
					id: dueCaseId,
					providerProfileId: dueProfileId,
					status: 'approved',
					docPhotoIds: [duePhotoId],
					submittedAt: decidedAt90,
					decidedAt: decidedAt90,
					decidedBy: adminId,
					decisionReason: 'retention due'
				},
				{
					id: holdCaseId,
					providerProfileId: holdProfileId,
					status: 'rejected',
					docPhotoIds: [holdPhotoId],
					submittedAt: decidedAt89,
					decidedAt: decidedAt89,
					decidedBy: adminId,
					decisionReason: 'retention hold'
				}
			]);

			const purge = await runIdentityDocPurgeJob(db, now, 'priv-03a-purge');
			expect(purge.casesPurged).toBe(1);

			const dueCase = await db
				.select({
					status: verificationCases.status,
					decidedAt: verificationCases.decidedAt,
					decidedBy: verificationCases.decidedBy,
					decisionReason: verificationCases.decisionReason,
					docPhotoIds: verificationCases.docPhotoIds,
					docsPurgedAt: verificationCases.docsPurgedAt
				})
				.from(verificationCases)
				.where(eq(verificationCases.id, dueCaseId))
				.limit(1);
			expect(dueCase[0]?.docsPurgedAt).not.toBeNull();
			expect(dueCase[0]?.status).toBe('approved');
			expect(dueCase[0]?.decidedAt).not.toBeNull();
			expect(dueCase[0]?.decidedBy).toBe(adminId);
			expect(dueCase[0]?.decisionReason).toBe('retention due');
			expect(dueCase[0]?.docPhotoIds).toContain(duePhotoId);

			const duePhotoRows = await db.select().from(photos).where(eq(photos.id, duePhotoId));
			expect(duePhotoRows).toHaveLength(0);

			const holdCase = await db
				.select({ docsPurgedAt: verificationCases.docsPurgedAt })
				.from(verificationCases)
				.where(eq(verificationCases.id, holdCaseId))
				.limit(1);
			expect(holdCase[0]?.docsPurgedAt).toBeNull();

			const holdPhotoRows = await db.select().from(photos).where(eq(photos.id, holdPhotoId));
			expect(holdPhotoRows).toHaveLength(1);
		});
	});
});
