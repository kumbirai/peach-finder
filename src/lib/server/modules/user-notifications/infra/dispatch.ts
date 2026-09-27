import { sql } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { publicAppOrigin } from '../../../env';
import { getUserEmail } from '../../identity-and-access';
import { newId, type UserId } from '../../../shared/ids';
import {
	notificationEmailHtml,
	sendTransactionalEmail
} from '../../../shared/mailer';
import type { NotificationChannel } from '../domain/categories';
import { isNotifBlockedBetween } from './block-cache';
import { filterEnabledChannels } from './preference-commands';
import { notificationLog } from './schema';

export type { NotificationChannel };

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
	actorUserId?: UserId | null;
};

export async function recordNotification(
	tx: Transaction,
	input: RecordNotificationInput
): Promise<void> {
	if (input.actorUserId && (await isNotifBlockedBetween(tx, input.actorUserId, input.userId))) {
		return;
	}
	const channels = await filterEnabledChannels(tx, input.userId, input.category, input.channels);
	for (const channel of channels) {
		await tx.execute(sql`SAVEPOINT notif_channel`);
		try {
			if (channel === 'email' && consumeFailNextEmailChannel()) {
				throw new Error('email adapter failed');
			}
			if (channel === 'email') {
				const to = await getUserEmail(tx, input.userId);
				if (!to) throw new Error('email recipient missing');
				const actionUrl = `${publicAppOrigin()}${input.deepLinkPath}`;
				await sendTransactionalEmail({
					to,
					subject: input.title,
					text: `${input.body}\n${actionUrl}`,
					html: notificationEmailHtml(input.body, actionUrl)
				});
			}
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
			await tx.execute(sql`RELEASE SAVEPOINT notif_channel`);
		} catch {
			await tx.execute(sql`ROLLBACK TO SAVEPOINT notif_channel`);
		}
	}
}

let failNextEmailChannel = false;

export function armFailNextEmailChannel(): void {
	failNextEmailChannel = true;
}

function consumeFailNextEmailChannel(): boolean {
	if (!failNextEmailChannel) return false;
	failNextEmailChannel = false;
	return true;
}
