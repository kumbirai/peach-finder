import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import { asId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { finalizePhotoFromMediaProcessed, prunePhotoFromMediaRemoved } from './photo-commands';

export async function handleMediaProcessed(
	db: Database,
	event: DomainEvent<'MediaProcessed', { photoId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'provider-profile.attach-photo');
		if (!inserted) return;
		await finalizePhotoFromMediaProcessed(
			tx,
			asId<'PhotoId'>(event.payload.photoId),
			event.correlationId,
			new Date()
		);
	});
}

export async function handleMediaRemoved(
	db: Database,
	event: DomainEvent<'MediaRemoved', { photoId: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'provider-profile.detach-photo');
		if (!inserted) return;
		await prunePhotoFromMediaRemoved(tx, asId<'PhotoId'>(event.payload.photoId));
	});
}
