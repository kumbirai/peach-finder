import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { DomainEvent } from '../../../shared/events';
import { type ProviderProfileId, type UserId } from '../../../shared/ids';
import { markProcessed } from '../../../shared/outbox';
import { providerProfiles } from './schema';
import { unpublishProviderProfile } from './unpublish-profile';

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
	if (event.payload.action !== 'unpublish' && event.payload.action !== 'suspend') {
		return;
	}

	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'provider-profile.moderation-effect');
		if (!inserted) return;

		const now = new Date(event.occurredAt);
		let profileId: ProviderProfileId | null = null;

		if (event.payload.action === 'unpublish' && event.payload.targetType === 'provider_profile') {
			profileId = event.payload.targetId as ProviderProfileId;
		} else if (event.payload.action === 'suspend' && event.payload.targetType === 'user') {
			const rows = await tx
				.select({ id: providerProfiles.id })
				.from(providerProfiles)
				.where(eq(providerProfiles.ownerId, event.payload.targetId as UserId))
				.limit(1);
			profileId = rows[0] ? (rows[0].id as ProviderProfileId) : null;
		}

		if (!profileId) return;

		await unpublishProviderProfile(tx, profileId, 'admin', event.correlationId, now);
	});
}
