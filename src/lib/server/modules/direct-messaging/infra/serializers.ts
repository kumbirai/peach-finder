import type { UserId } from '../../../shared/ids';
import { outboundDeliveryState, type OutboundDeliveryState } from '../domain/delivery-state';

import type { ThreadSummary } from '../infra/messaging-commands';

export type ThreadListItemDTO = {
	threadId: string;
	counterpartName: string;
	lastMessagePreview: string;
	lastActivityAt: string;
	unreadCount: number;
};

export function toThreadListItem(thread: ThreadSummary): ThreadListItemDTO {
	return {
		threadId: thread.threadId,
		counterpartName: thread.counterpartName,
		lastMessagePreview: thread.lastMessagePreview,
		lastActivityAt: thread.lastActivityAt.toISOString(),
		unreadCount: thread.unreadCount
	};
}

export type MessageSenderDTO = {
	id: string;
	displayName: string;
};

export type MessageDTO = {
	id: string;
	threadId: string;
	body: string;
	sentAt: string;
	sender: MessageSenderDTO;
	outboundDeliveryState: OutboundDeliveryState | null;
	deliveredAt: string | null;
	readAt: string | null;
};

type MessageRow = {
	id: string;
	threadId: string;
	body: string;
	sentAt: Date;
	senderId: string;
	deliveredAt: Date | null;
	readAt: Date | null;
	isDeletedSenderAccount: boolean;
};

export function toMessageDTO(
	message: MessageRow,
	viewerId: UserId,
	senderDisplayName: string
): MessageDTO {
	const sender: MessageSenderDTO = message.isDeletedSenderAccount
		? { id: message.senderId, displayName: 'Deleted account' }
		: { id: message.senderId, displayName: senderDisplayName };

	const isOutbound = message.senderId === viewerId;

	return {
		id: message.id,
		threadId: message.threadId,
		body: message.body,
		sentAt: message.sentAt.toISOString(),
		sender,
		outboundDeliveryState: isOutbound
			? outboundDeliveryState({
					deliveredAt: message.deliveredAt,
					readAt: message.readAt
				})
			: null,
		deliveredAt: message.deliveredAt?.toISOString() ?? null,
		readAt: message.readAt?.toISOString() ?? null
	};
}
