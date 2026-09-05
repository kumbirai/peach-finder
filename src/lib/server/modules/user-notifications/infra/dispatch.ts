import type { Transaction } from '../../../db';
import { newId, type UserId } from '../../../shared/ids';
import { notificationLog } from './schema';

export type NotificationChannel = 'in_app' | 'email';

export type RecordNotificationInput = {
	userId: UserId;
	category: string;
	channels: readonly NotificationChannel[];
	title: string;
	body: string;
	deepLinkPath: string;
	relatedEntityType?: string | null;
	relatedEntityId?: string | null;
	correlationId: string;
	now: Date;
};

export async function recordNotification(
	tx: Transaction,
	input: RecordNotificationInput
): Promise<void> {
	for (const channel of input.channels) {
		await tx.insert(notificationLog).values({
			id: newId(),
			userId: input.userId,
			category: input.category,
			channel,
			status: 'sent',
			title: input.title,
			body: input.body,
			deepLinkPath: input.deepLinkPath,
			relatedEntityType: input.relatedEntityType ?? null,
			relatedEntityId: input.relatedEntityId ?? null,
			readAt: null,
			dispatchedAt: input.now,
			createdAt: input.now,
			correlationId: input.correlationId
		});
	}
}
