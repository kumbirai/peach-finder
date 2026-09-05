import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { PhotoId, UserId } from '../../../shared/ids';
import { photos, photoVariants } from './schema';

export type PhotoStatusDto = {
	photoId: string;
	status: string;
	variantUrls?: Record<string, string>;
	failedReason?: string | null;
};

function pickVariantUrls(rows: Array<{ variant: string; url: string }>): Record<string, string> {
	const urls: Record<string, string> = {};
	for (const row of rows) {
		urls[row.variant] = row.url;
	}
	return urls;
}

export async function getUploadStatus(
	db: Database,
	photoId: PhotoId,
	ownerId: UserId
): Promise<PhotoStatusDto | null> {
	const rows = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
	const row = rows[0];
	if (!row || row.ownerId !== ownerId) return null;

	const variants = await db
		.select({ variant: photoVariants.variant, url: photoVariants.url })
		.from(photoVariants)
		.where(eq(photoVariants.photoId, photoId));

	const dto: PhotoStatusDto = {
		photoId,
		status: row.status,
		failedReason: row.failedReason
	};
	if (variants.length > 0) {
		dto.variantUrls = pickVariantUrls(variants);
	}
	return dto;
}

export async function getVariantUrl(
	db: Database,
	photoId: PhotoId,
	variantPrefix: string
): Promise<string | null> {
	const rows = await db
		.select({ url: photoVariants.url, variant: photoVariants.variant })
		.from(photoVariants)
		.where(eq(photoVariants.photoId, photoId));

	const match =
		rows.find((r) => r.variant === `${variantPrefix}_webp`) ??
		rows.find((r) => r.variant.startsWith(`${variantPrefix}_`));
	return match?.url ?? null;
}

export async function listVariantUrlsForPhoto(
	db: Database,
	photoId: PhotoId
): Promise<Record<string, string>> {
	const rows = await db
		.select({ variant: photoVariants.variant, url: photoVariants.url })
		.from(photoVariants)
		.where(eq(photoVariants.photoId, photoId));
	return pickVariantUrls(rows);
}
