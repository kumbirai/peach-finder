export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PROFILE_PHOTOS = 12;

export type UploadScope = 'profile_photo' | 'message_attachment';

export function validateUploadSize(byteLength: number): string | null {
	if (byteLength <= 0) return 'Choose an image to upload.';
	if (byteLength > MAX_UPLOAD_BYTES) {
		return 'This image is too large. Photos must be 10 MB or smaller.';
	}
	return null;
}

export function validateProfileGalleryCount(currentReadyCount: number): string | null {
	if (currentReadyCount >= MAX_PROFILE_PHOTOS) {
		return 'You already have the maximum number of photos (12).';
	}
	return null;
}
