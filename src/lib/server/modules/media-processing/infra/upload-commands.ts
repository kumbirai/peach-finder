import type { Database } from '../../../db';
import { newId, type PhotoId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import {
	validateProfileGalleryCount,
	validateUploadSize,
	type UploadScope
} from '../domain/upload-policy';
import { photos } from './schema';
import { processPhotoById } from './process-photo';
import { writeStagingObject } from './storage';

export type UploadInitResult = {
	photoId: PhotoId;
	status: 'pending' | 'ready' | 'failed';
};

export async function uploadMediaPhoto(
	db: Database,
	ownerId: UserId,
	bytes: Buffer,
	scope: UploadScope,
	galleryReadyCount: number,
	correlationId: string,
	now: Date
): Promise<Result<UploadInitResult, UseCaseError>> {
	const sizeIssue = validateUploadSize(bytes.length);
	if (sizeIssue) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'file', message: sizeIssue }]
		});
	}

	if (scope === 'profile_photo') {
		const limitIssue = validateProfileGalleryCount(galleryReadyCount);
		if (limitIssue) {
			return Err({ kind: 'conflict', reason: limitIssue });
		}
	}

	const photoId = newId<'PhotoId'>();
	const stagingId = crypto.randomUUID();

	await db.insert(photos).values({
		id: photoId,
		ownerId,
		bucket: 'media',
		status: 'pending'
	});

	await writeStagingObject(stagingId, bytes);

	const processed = await processPhotoById(
		db,
		photoId,
		`_staging/${stagingId}`,
		correlationId,
		now
	);
	if (!processed.ok) {
		return processed;
	}

	return Ok({ photoId, status: 'ready' });
}
