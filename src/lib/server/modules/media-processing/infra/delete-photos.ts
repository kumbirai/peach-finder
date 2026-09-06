import type { Database } from '../../../db';
import type { PhotoId } from '../../../shared/ids';
import { removePhoto } from './remove-photo';

/** Deletes multiple photos (identity-docs bucket or otherwise) in sequence. */
export async function deletePhotos(
	db: Database,
	photoIds: PhotoId[],
	correlationId: string
): Promise<number> {
	let removed = 0;
	for (const photoId of photoIds) {
		const result = await removePhoto(db, photoId, correlationId);
		if (result.ok) removed += 1;
	}
	return removed;
}
