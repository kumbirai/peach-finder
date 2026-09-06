import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import { type PhotoId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { removePhoto } from './remove-photo';

export async function handleModerationActionTaken(
	db: Database,
	event: DomainEvent<
		'ModerationActionTaken',
		{
			moderationActionId: string;
			targetType: string;
			targetId: string;
			action: string;
		}
	>
): Promise<void> {
	if (event.payload.action !== 'remove_photo' || event.payload.targetType !== 'photo') {
		return;
	}

	const photoId = event.payload.targetId as PhotoId;
	const removed = await removePhoto(db, photoId, event.correlationId);
	if (!removed.ok) {
		throw new Error('Failed to remove moderated photo.');
	}

	const inserted = await db.transaction(async (tx) =>
		markProcessed(tx, event.eventId, 'media-processing.moderation-effect')
	);
	if (!inserted) return;
}
