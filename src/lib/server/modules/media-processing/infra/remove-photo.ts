import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { PhotoId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId } from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { Ok, type Result, type UseCaseError } from '../../../shared/result';
import { photos, photoVariants } from './schema';
import { deleteObject } from './storage';

export async function removePhoto(
	db: Database,
	photoId: PhotoId,
	correlationId: string
): Promise<Result<void, UseCaseError>> {
	const rows = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
	const row = rows[0];
	if (!row) return Ok(undefined);

	const variants = await db
		.select({ url: photoVariants.url })
		.from(photoVariants)
		.where(eq(photoVariants.photoId, photoId));

	await db.transaction(async (tx) => {
		await tx.delete(photoVariants).where(eq(photoVariants.photoId, photoId));
		await tx.delete(photos).where(eq(photos.id, photoId));

		const event: DomainEvent<'MediaRemoved', { photoId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'MediaRemoved',
			version: 1,
			occurredAt: asInstant(new Date().toISOString()),
			correlationId,
			payload: { photoId }
		};
		await publish(tx, event);
	});

	if (row.objectKey) {
		await deleteObject(row.objectKey);
	}
	for (const variant of variants) {
		const key = variant.url.split('/media/')[1];
		if (key) await deleteObject(key);
	}

	return Ok(undefined);
}
