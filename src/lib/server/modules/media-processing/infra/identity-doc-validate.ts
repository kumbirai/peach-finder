import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { PhotoId, UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { photos } from './schema';

function validationIssue(path: string, message: string): UseCaseError {
	return { kind: 'validation_failed', issues: [{ path, message }] };
}

export async function validateIdentityDocPhotos(
	db: Database,
	ownerId: UserId,
	photoIds: PhotoId[]
): Promise<Result<void, UseCaseError>> {
	if (photoIds.length !== 2) {
		return Err(
			validationIssue('docPhotoIds', 'Upload both your government ID photo and a selfie.')
		);
	}

	const unique = new Set(photoIds);
	if (unique.size !== photoIds.length) {
		return Err(validationIssue('docPhotoIds', 'Use a separate photo for your ID and your selfie.'));
	}

	const rows = await db
		.select({
			id: photos.id,
			ownerId: photos.ownerId,
			bucket: photos.bucket,
			status: photos.status
		})
		.from(photos)
		.where(inArray(photos.id, photoIds));

	if (rows.length !== photoIds.length) {
		return Err(validationIssue('docPhotoIds', 'One or more photos could not be found.'));
	}

	for (const row of rows) {
		if (row.ownerId !== ownerId) {
			return Err(validationIssue('docPhotoIds', 'Each photo must belong to your account.'));
		}
		if (row.bucket !== 'identity-docs' || row.status !== 'ready') {
			return Err(
				validationIssue('docPhotoIds', 'Upload identity documents using the form provided.')
			);
		}
	}

	return Ok(undefined);
}

export async function identityDocOwnedBy(
	db: Database,
	photoId: PhotoId,
	ownerId: UserId
): Promise<boolean> {
	const rows = await db
		.select({ id: photos.id })
		.from(photos)
		.where(
			and(
				eq(photos.id, photoId),
				eq(photos.ownerId, ownerId),
				eq(photos.bucket, 'identity-docs'),
				eq(photos.status, 'ready')
			)
		)
		.limit(1);
	return rows.length > 0;
}
