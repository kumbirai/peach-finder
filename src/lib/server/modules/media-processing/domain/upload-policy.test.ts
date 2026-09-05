import { describe, expect, it } from 'vitest';
import {
	MAX_PROFILE_PHOTOS,
	MAX_UPLOAD_BYTES,
	validateProfileGalleryCount,
	validateUploadSize
} from './upload-policy';

describe('upload-policy', () => {
	it('rejects empty uploads', () => {
		expect(validateUploadSize(0)).toMatch(/choose an image/i);
	});

	it('rejects files over 10 MB', () => {
		expect(validateUploadSize(MAX_UPLOAD_BYTES + 1)).toMatch(/too large/i);
	});

	it('accepts valid sizes', () => {
		expect(validateUploadSize(1024)).toBeNull();
	});

	it('rejects gallery over 12 photos', () => {
		expect(validateProfileGalleryCount(MAX_PROFILE_PHOTOS)).toMatch(/maximum/i);
	});
});
