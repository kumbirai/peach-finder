import { createHmac, timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publicAppOrigin } from '../../../env';
import { writeAudit } from '../../../shared/audit';
import type { PhotoId, UserId } from '../../../shared/ids';
import { newId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { validateUploadSize } from '../domain/upload-policy';
import { photos } from './schema';
import { readLocalMediaFile, sha256, writeFinalObject } from './storage';

export const IDENTITY_DOC_PRESIGN_TTL_MS = 5 * 60_000;

function signingKey(): Buffer {
	const raw = process.env.TOTP_ENCRYPTION_KEY;
	const material = raw
		? Buffer.from(raw, 'base64')
		: Buffer.from('dev-totp-key-32bytes-not-prod!!', 'utf8');
	return createHash('sha256').update(material).digest();
}

function signPayload(payload: string): string {
	return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function buildIdentityDocPresignPayload(photoId: PhotoId, expiresAtMs: number): string {
	return `${photoId}:${expiresAtMs}`;
}

export function verifyIdentityDocPresign(
	photoId: PhotoId,
	expiresAtMs: number,
	signature: string,
	now: Date
): boolean {
	if (!Number.isFinite(expiresAtMs) || expiresAtMs < now.getTime()) return false;
	const payload = buildIdentityDocPresignPayload(photoId, expiresAtMs);
	const expected = signPayload(payload);
	try {
		return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
	} catch {
		return false;
	}
}

export function buildIdentityDocFetchUrl(photoId: PhotoId, expiresAt: Date): string {
	const expiresAtMs = expiresAt.getTime();
	const signature = signPayload(buildIdentityDocPresignPayload(photoId, expiresAtMs));
	const origin = publicAppOrigin();
	return `${origin}/admin/api/media/identity-doc/${photoId}?exp=${expiresAtMs}&sig=${signature}`;
}

export async function storeIdentityDoc(
	db: Database,
	ownerId: UserId,
	bytes: Buffer,
	now: Date,
	photoId?: PhotoId
): Promise<Result<{ photoId: PhotoId }, UseCaseError>> {
	const sizeIssue = validateUploadSize(bytes.length);
	if (sizeIssue) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'file', message: sizeIssue }]
		});
	}

	let cleaned: Buffer;
	try {
		cleaned = await sharp(bytes).rotate().jpeg({ quality: 92 }).toBuffer();
	} catch {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'file', message: 'Upload a clear photo we can read.' }]
		});
	}

	const resolvedPhotoId = photoId ?? newId<'PhotoId'>();
	const contentHash = sha256(cleaned);
	const objectKey = `identity-docs/${contentHash}/${resolvedPhotoId}.jpg`;

	const existingHash = await db
		.select({ id: photos.id })
		.from(photos)
		.where(and(eq(photos.bucket, 'identity-docs'), eq(photos.contentHash, contentHash)))
		.limit(1);
	if (existingHash[0]) {
		return Ok({ photoId: existingHash[0].id as PhotoId });
	}

	await db.insert(photos).values({
		id: resolvedPhotoId,
		ownerId,
		bucket: 'identity-docs',
		objectKey,
		contentHash,
		status: 'ready',
		mimeType: 'image/jpeg',
		sizeBytes: cleaned.length,
		createdAt: now,
		updatedAt: now
	});

	await writeFinalObject(objectKey, cleaned);
	return Ok({ photoId: resolvedPhotoId });
}

export async function issueIdentityDocUrl(
	db: Database,
	input: {
		photoId: PhotoId;
		adminId: UserId;
		correlationId: string;
		now: Date;
	}
): Promise<Result<{ url: string; expiresAt: string }, UseCaseError>> {
	const rows = await db.select().from(photos).where(eq(photos.id, input.photoId)).limit(1);
	const row = rows[0];
	if (!row || row.bucket !== 'identity-docs' || row.status !== 'ready' || !row.objectKey) {
		return Err({ kind: 'not_found', resource: 'photo' });
	}

	const expiresAt = new Date(input.now.getTime() + IDENTITY_DOC_PRESIGN_TTL_MS);
	const url = buildIdentityDocFetchUrl(input.photoId, expiresAt);

	await db.transaction(async (tx: Transaction) => {
		await writeAudit(tx, {
			actorId: input.adminId,
			actorRole: 'admin',
			action: 'media-processing.identity_doc_presign',
			targetType: 'photo',
			targetId: input.photoId,
			correlationId: input.correlationId
		});
	});

	return Ok({ url, expiresAt: expiresAt.toISOString() });
}

export async function readIdentityDocBytes(db: Database, photoId: PhotoId): Promise<Buffer | null> {
	const rows = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
	const row = rows[0];
	if (!row || row.bucket !== 'identity-docs' || !row.objectKey) return null;
	return readLocalMediaFile(row.objectKey);
}
