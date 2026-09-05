import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { newId, type PhotoId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';
import { VARIANT_SPECS, type VariantKind } from '../domain/variant-spec';
import { photos, photoVariants } from './schema';
import {
	deleteObject,
	mediaPublicUrl,
	readStagingObject,
	sha256,
	writeFinalObject
} from './storage';

export type ProcessedVariant = {
	kind: VariantKind;
	url: string;
	width: number;
	height: number;
	bytes: Buffer;
	mimeType: 'image/webp' | 'image/jpeg';
};

export async function decodeImage(bytes: Buffer): Promise<sharp.Sharp> {
	try {
		return sharp(bytes, { failOn: 'none' });
	} catch {
		throw new Error('IMAGE_UNDECODABLE');
	}
}

export async function assertDecodable(bytes: Buffer): Promise<boolean> {
	try {
		await sharp(bytes).metadata();
		return true;
	} catch {
		return false;
	}
}

export async function encodeVariants(source: Buffer): Promise<ProcessedVariant[]> {
	const image = sharp(source);
	const metadata = await image.metadata();
	if (!metadata.width || !metadata.height) {
		throw new Error('IMAGE_UNDECODABLE');
	}

	const outputs: ProcessedVariant[] = [];
	for (const spec of VARIANT_SPECS) {
		const resized = sharp(source).rotate().resize({
			width: spec.longestEdge,
			height: spec.longestEdge,
			fit: 'inside',
			withoutEnlargement: true
		});
		const webp = await resized.webp().toBuffer({ resolveWithObject: true });
		const jpeg = await sharp(source)
			.rotate()
			.resize({
				width: spec.longestEdge,
				height: spec.longestEdge,
				fit: 'inside',
				withoutEnlargement: true
			})
			.jpeg()
			.toBuffer({ resolveWithObject: true });

		outputs.push({
			kind: spec.kind,
			url: '',
			width: webp.info.width,
			height: webp.info.height,
			bytes: webp.data,
			mimeType: 'image/webp'
		});
		outputs.push({
			kind: spec.kind,
			url: '',
			width: jpeg.info.width,
			height: jpeg.info.height,
			bytes: jpeg.data,
			mimeType: 'image/jpeg'
		});
	}
	return outputs;
}

export async function processPhotoById(
	db: Database,
	photoId: PhotoId,
	stagingKey: string,
	correlationId: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const rows = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
	const row = rows[0];
	if (!row) return Err({ kind: 'not_found', resource: 'photo' });
	if (row.status === 'ready') return Ok(undefined);

	let source: Buffer;
	try {
		source = await readStagingObject(stagingKey);
	} catch {
		await markFailed(db, photoId, 'We could not read your upload. Please try again.', now);
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'file', message: 'Image could not be read.' }]
		});
	}

	const decodable = await assertDecodable(source);
	if (!decodable) {
		await markFailed(db, photoId, 'This file is not a supported image format.', now);
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'file', message: 'This file is not a supported image format.' }]
		});
	}

	await db
		.update(photos)
		.set({ status: 'processing', updatedAt: now })
		.where(eq(photos.id, photoId));

	try {
		const encoded = await encodeVariants(source);
		const contentHash = sha256(encoded[0]!.bytes);
		const variantUrls: Record<string, string> = {};
		const variantRows: Array<{
			photoId: string;
			variant: string;
			url: string;
			width: number;
			height: number;
		}> = [];

		for (const item of encoded) {
			const ext = item.mimeType === 'image/webp' ? 'webp' : 'jpg';
			const objectKey = `${contentHash}/${item.kind}.${ext}`;
			await writeFinalObject(objectKey, item.bytes);
			const url = mediaPublicUrl(objectKey);
			const variantKey = `${item.kind}_${ext === 'webp' ? 'webp' : 'jpeg'}`;
			variantUrls[variantKey] = url;
			variantRows.push({
				photoId,
				variant: variantKey,
				url,
				width: item.width,
				height: item.height
			});
		}

		await db.transaction(async (tx) => {
			await tx
				.update(photos)
				.set({
					status: 'ready',
					objectKey: `${contentHash}/card_640.webp`,
					contentHash,
					mimeType: 'image/webp',
					sizeBytes: source.length,
					failedReason: null,
					updatedAt: now
				})
				.where(eq(photos.id, photoId));

			for (const variant of variantRows) {
				await tx.insert(photoVariants).values(variant).onConflictDoNothing();
			}

			const event: DomainEvent<
				'MediaProcessed',
				{ photoId: string; ownerId: string; variantUrls: Record<string, string> }
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'MediaProcessed',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId,
				payload: {
					photoId,
					ownerId: row.ownerId,
					variantUrls
				}
			};
			await publish(tx, event);
		});

		await deleteObject(stagingKey);
		return Ok(undefined);
	} catch {
		await markFailed(
			db,
			photoId,
			'We could not process this image. Please try another photo.',
			now
		);
		return Err({
			kind: 'validation_failed',
			issues: [
				{ path: 'file', message: 'We could not process this image. Please try another photo.' }
			]
		});
	}
}

async function markFailed(
	db: Database,
	photoId: PhotoId,
	reason: string,
	now: Date
): Promise<void> {
	await db
		.update(photos)
		.set({ status: 'failed', failedReason: reason, updatedAt: now })
		.where(eq(photos.id, photoId));
}

export async function getPhotoOwner(db: Database, photoId: PhotoId): Promise<UserId | null> {
	const rows = await db
		.select({ ownerId: photos.ownerId })
		.from(photos)
		.where(eq(photos.id, photoId))
		.limit(1);
	return rows[0] ? (rows[0].ownerId as UserId) : null;
}
