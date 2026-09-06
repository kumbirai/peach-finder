import type { Database } from '../../db';
import type { PhotoId, UserId } from '../../shared/ids';
import type { Result, UseCaseError } from '../../shared/result';
import type { UploadScope } from './domain/upload-policy';
import { getPhotoOwner } from './infra/process-photo';
import { getUploadStatus, listVariantUrlsForPhoto } from './infra/photo-read';
import { removePhoto } from './infra/remove-photo';
import { deletePhotos } from './infra/delete-photos';
import { uploadMediaPhoto, type UploadInitResult } from './infra/upload-commands';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}

export { getPhotoOwner };

export async function uploadProfilePhoto(
	db: Database,
	ownerId: UserId,
	bytes: Buffer,
	scope: UploadScope,
	galleryReadyCount: number,
	correlationId: string,
	now: Date
): Promise<Result<UploadInitResult, UseCaseError>> {
	return uploadMediaPhoto(db, ownerId, bytes, scope, galleryReadyCount, correlationId, now);
}

export async function getPhotoUploadStatus(db: Database, photoId: PhotoId, ownerId: UserId) {
	return getUploadStatus(db, photoId, ownerId);
}

export async function removeMediaPhoto(db: Database, photoId: PhotoId, correlationId: string) {
	return removePhoto(db, photoId, correlationId);
}

export { deletePhotos };

export async function getPhotoVariantUrls(db: Database, photoId: PhotoId) {
	return listVariantUrlsForPhoto(db, photoId);
}

export { handleModerationActionTaken as handleMediaModeration } from './infra/moderation-subscriptions';
export { readLocalMediaFile } from './infra/storage';
export {
	IDENTITY_DOC_PRESIGN_TTL_MS,
	buildIdentityDocFetchUrl,
	buildIdentityDocPresignPayload,
	issueIdentityDocUrl,
	readIdentityDocBytes,
	storeIdentityDoc,
	verifyIdentityDocPresign
} from './infra/identity-doc-presign';
export { validateIdentityDocPhotos } from './infra/identity-doc-validate';
