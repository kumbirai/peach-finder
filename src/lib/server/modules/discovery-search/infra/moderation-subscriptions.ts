import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import { type ProviderProfileId, type UserId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { removeSearchProjection } from './projection-commands';

export async function handleModerationProjectionRemove(
	db: Database,
	event: DomainEvent<
		'ModerationActionTaken',
		{
			action: string;
			targetType: string;
			targetId: string;
		}
	>
): Promise<void> {
	if (event.payload.action !== 'unpublish' && event.payload.action !== 'suspend') {
		return;
	}

	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'discovery-search.projection-remove');
		if (!inserted) return;

		let profileId: ProviderProfileId | null = null;
		if (event.payload.targetType === 'provider_profile') {
			profileId = event.payload.targetId as ProviderProfileId;
		} else if (event.payload.targetType === 'user') {
			profileId = await getOwnedProfileIdDb(tx, event.payload.targetId as UserId);
		}

		if (!profileId) return;
		await removeSearchProjection(tx, profileId);
	});
}
