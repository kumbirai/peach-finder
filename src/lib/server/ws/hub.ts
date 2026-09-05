import type { WebSocket } from 'ws';
import { getDb } from '../db';
import type { MessageId, ThreadId, UserId } from '../shared/ids';
import { log } from '../shared/logger';
import { bodyPreview } from '../modules/direct-messaging/domain/delivery-state';
import {
	markMessagesDelivered,
	markThreadReadUpTo
} from '../modules/direct-messaging/infra/messaging-queries';
import { resolveThreadAccess } from '../modules/direct-messaging/infra/thread-access';
import { upsertPresenceHeartbeat } from '../modules/direct-messaging/infra/presence-heartbeat';

export type WsEnvelope<Type extends string = string, Payload = unknown> = {
	type: Type;
	payload: Payload;
	sentAt: string;
};

type ClientMessage =
	| { type: 'presence.heartbeat'; payload: Record<string, never> }
	| { type: 'message.received'; payload: { threadId: string; messageId: string } }
	| { type: 'thread.typing'; payload: { threadId: string } };

const CONNECTIONS_KEY = '__peach_ws_connections__';

function connectionMap(): Map<string, Set<WebSocket>> {
	const globalStore = globalThis as typeof globalThis & {
		[CONNECTIONS_KEY]?: Map<string, Set<WebSocket>>;
	};
	if (!globalStore[CONNECTIONS_KEY]) {
		globalStore[CONNECTIONS_KEY] = new Map();
	}
	return globalStore[CONNECTIONS_KEY];
}

function userKey(userId: UserId): string {
	return userId;
}

export function registerWsConnection(userId: UserId, ws: WebSocket): void {
	const connections = connectionMap();
	const key = userKey(userId);
	const set = connections.get(key) ?? new Set<WebSocket>();
	set.add(ws);
	connections.set(key, set);

	ws.on('close', () => {
		const current = connections.get(key);
		if (!current) return;
		current.delete(ws);
		if (current.size === 0) connections.delete(key);
	});
}

export function pushToUser(userId: UserId, envelope: WsEnvelope): void {
	const set = connectionMap().get(userKey(userId));
	if (!set) return;
	const raw = JSON.stringify({ ...envelope, sentAt: new Date().toISOString() });
	for (const ws of set) {
		if (ws.readyState === ws.OPEN) {
			ws.send(raw);
		}
	}
}

export function hasLiveConnection(userId: UserId): boolean {
	const set = connectionMap().get(userKey(userId));
	if (!set) return false;
	for (const ws of set) {
		if (ws.readyState === ws.OPEN) return true;
	}
	return false;
}

export async function notifyMessageSent(input: {
	threadId: ThreadId;
	messageId: MessageId;
	senderId: UserId;
	recipientId: UserId;
	body: string;
	sentAt: Date;
}): Promise<void> {
	if (!hasLiveConnection(input.recipientId)) return;

	pushToUser(input.recipientId, {
		type: 'message.sent',
		payload: {
			threadId: input.threadId,
			messageId: input.messageId,
			senderId: input.senderId,
			bodyPreview: bodyPreview(input.body),
			sentAt: input.sentAt.toISOString()
		},
		sentAt: new Date().toISOString()
	});
}

export function notifyMessageDelivered(input: {
	threadId: ThreadId;
	messageId: string;
	senderId: UserId;
	deliveredAt: string;
}): void {
	pushToUser(input.senderId, {
		type: 'message.delivered',
		payload: {
			threadId: input.threadId,
			messageId: input.messageId,
			deliveredAt: input.deliveredAt
		},
		sentAt: new Date().toISOString()
	});
}

export function notifyMessageRead(input: {
	threadId: ThreadId;
	messageId: string;
	senderId: UserId;
	readerId: UserId;
}): void {
	pushToUser(input.senderId, {
		type: 'message.read',
		payload: {
			threadId: input.threadId,
			messageId: input.messageId,
			readerId: input.readerId
		},
		sentAt: new Date().toISOString()
	});
}

export async function handleWsClientMessage(userId: UserId, raw: string): Promise<void> {
	let parsed: ClientMessage;
	try {
		parsed = JSON.parse(raw) as ClientMessage;
	} catch {
		return;
	}

	const db = getDb();
	const now = new Date();

	if (parsed.type === 'presence.heartbeat') {
		await upsertPresenceHeartbeat(db, userId, now);
		return;
	}

	if (parsed.type === 'message.received') {
		const threadId = parsed.payload.threadId as ThreadId;
		const messageId = parsed.payload.messageId as MessageId;
		const access = await resolveThreadAccess(db, threadId, userId);
		if (!access.ok) return;

		const delivered = await markMessagesDelivered(db, threadId, userId, [messageId], now);
		for (const row of delivered) {
			notifyMessageDelivered({
				threadId,
				messageId: row.messageId,
				senderId: row.senderId,
				deliveredAt: row.deliveredAt
			});
		}
		return;
	}

	if (parsed.type === 'thread.typing') {
		const threadId = parsed.payload.threadId as ThreadId;
		const access = await resolveThreadAccess(db, threadId, userId);
		if (!access.ok) return;
		pushToUser(access.value.counterpartUserId, {
			type: 'thread.typing',
			payload: { threadId },
			sentAt: now.toISOString()
		});
		return;
	}

	log('warn', 'unknown ws message type', { type: (parsed as { type?: string }).type ?? 'unknown' });
}

export async function markThreadReadAndNotify(
	threadId: ThreadId,
	readerId: UserId,
	upToMessageId: MessageId
): Promise<void> {
	const db = getDb();
	const now = new Date();
	const marked = await markThreadReadUpTo(db, threadId, readerId, upToMessageId, now);
	if (!marked.ok) return;
	for (const row of marked.value) {
		notifyMessageRead({
			threadId,
			messageId: row.messageId,
			senderId: row.senderId,
			readerId: row.readerId
		});
	}
}

// Test-only reset
export function resetWsConnectionsForTests(): void {
	connectionMap().clear();
}
