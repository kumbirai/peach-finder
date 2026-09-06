import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/lib/server/db';
import { seedCore } from './seed-core';
import { seedPlatform, loadConfigCache } from '../src/lib/server/modules/platform-configuration';
import { storeIdentityDoc } from '../src/lib/server/modules/media-processing';
import { photos } from '../src/lib/server/modules/media-processing/infra/schema';
import {
	badgeState,
	verificationCases
} from '../src/lib/server/modules/trust-and-safety/infra/schema';
import type { PhotoId, UserId } from '../src/lib/server/shared/ids';
import {
	SEED_VERIF_NEW_ID_PHOTO_ID,
	SEED_VERIF_NEW_SELFIE_PHOTO_ID,
	SEED_VERIF_OLD_ID_PHOTO_ID,
	SEED_VERIF_OLD_SELFIE_PHOTO_ID,
	SEED_VERIF_PENDING_NEW_CASE_ID,
	SEED_VERIF_PENDING_NEW_OWNER_ID,
	SEED_VERIF_PENDING_NEW_PROFILE_ID,
	SEED_VERIF_PENDING_OLD_CASE_ID,
	SEED_VERIF_PENDING_OLD_OWNER_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID
} from './seed-verification-constants';

export {
	SEED_VERIF_PENDING_OLD_CASE_ID,
	SEED_VERIF_PENDING_NEW_CASE_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID,
	SEED_VERIF_PENDING_NEW_PROFILE_ID,
	SEED_VERIF_PENDING_OLD_OWNER_ID,
	SEED_VERIF_PENDING_NEW_OWNER_ID
} from './seed-verification-constants';

async function identityDocFixture(unique: string): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
		<rect width="100%" height="100%" fill="#f5f0eb"/>
		<text x="16" y="40" font-family="sans-serif" font-size="14" fill="#2b2622">${unique}</text>
	</svg>`;
	return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function ensureIdentityDoc(
	db: Database,
	photoId: PhotoId,
	ownerId: UserId,
	submittedAt: Date
): Promise<PhotoId> {
	const existing = await db
		.select({ id: photos.id })
		.from(photos)
		.where(eq(photos.id, photoId))
		.limit(1);
	if (existing[0]) return photoId;

	const stored = await storeIdentityDoc(
		db,
		ownerId,
		await identityDocFixture(photoId),
		submittedAt,
		photoId
	);
	if (!stored.ok) throw new Error(`seed-verification: failed to store ${photoId}`);
	return stored.value.photoId;
}

async function seedPendingCase(
	db: Database,
	input: {
		caseId: string;
		profileId: string;
		ownerId: string;
		idPhotoId: PhotoId;
		selfiePhotoId: PhotoId;
		submittedAt: Date;
	}
): Promise<string[]> {
	const ownerId = input.ownerId as UserId;
	const idPhotoId = await ensureIdentityDoc(db, input.idPhotoId, ownerId, input.submittedAt);
	const selfiePhotoId = await ensureIdentityDoc(
		db,
		input.selfiePhotoId,
		ownerId,
		input.submittedAt
	);
	const docPhotoIds = [idPhotoId, selfiePhotoId];

	await db
		.insert(verificationCases)
		.values({
			id: input.caseId,
			providerProfileId: input.profileId,
			status: 'pending',
			docPhotoIds,
			submittedAt: input.submittedAt
		})
		.onConflictDoUpdate({
			target: verificationCases.id,
			set: {
				status: 'pending',
				docPhotoIds,
				submittedAt: input.submittedAt,
				decidedAt: null,
				decidedBy: null,
				decisionReason: null
			}
		});

	return docPhotoIds;
}

/** Providers in each identity-verification state for admin queue + E2E flows. */
export async function seedVerification(db: Database): Promise<void> {
	await seedCore(db);

	const now = new Date('2026-09-06T12:00:00.000Z');

	await seedPendingCase(db, {
		caseId: SEED_VERIF_PENDING_OLD_CASE_ID,
		profileId: SEED_VERIF_PENDING_OLD_PROFILE_ID,
		ownerId: SEED_VERIF_PENDING_OLD_OWNER_ID,
		idPhotoId: SEED_VERIF_OLD_ID_PHOTO_ID as PhotoId,
		selfiePhotoId: SEED_VERIF_OLD_SELFIE_PHOTO_ID as PhotoId,
		submittedAt: new Date('2026-09-03T10:00:00.000Z')
	});

	await seedPendingCase(db, {
		caseId: SEED_VERIF_PENDING_NEW_CASE_ID,
		profileId: SEED_VERIF_PENDING_NEW_PROFILE_ID,
		ownerId: SEED_VERIF_PENDING_NEW_OWNER_ID,
		idPhotoId: SEED_VERIF_NEW_ID_PHOTO_ID as PhotoId,
		selfiePhotoId: SEED_VERIF_NEW_SELFIE_PHOTO_ID as PhotoId,
		submittedAt: new Date('2026-09-05T10:00:00.000Z')
	});

	await db
		.insert(verificationCases)
		.values({
			id: '01900000-0000-7000-8000-00000000d103',
			providerProfileId: '01900000-0000-7000-8000-000000000102',
			status: 'rejected',
			docPhotoIds: [],
			submittedAt: new Date('2026-08-20T10:00:00.000Z'),
			decidedAt: new Date('2026-08-21T10:00:00.000Z'),
			decidedBy: '01900000-0000-7000-8000-000000000097',
			decisionReason: 'ID photo was too blurry to verify.'
		})
		.onConflictDoNothing();

	await db
		.update(badgeState)
		.set({
			suppressed: true,
			suppressedReason: 'Identity details changed — badge hidden pending re-review.',
			updatedAt: now
		})
		.where(eq(badgeState.providerProfileId, '01900000-0000-7000-8000-000000000102'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { getDb, closeDb } = await import('../src/lib/server/db');
	const db = getDb();
	await seedPlatform(db);
	await loadConfigCache(db);
	await seedVerification(db);
	await closeDb();
	console.info('seed-verification complete');
}
