import type { ThreadMessage } from './types';

export function mergeThreadMessages(
	existing: ThreadMessage[],
	incoming: ThreadMessage[]
): ThreadMessage[] {
	const byId = new Map(existing.map((message) => [message.id, message]));
	for (const message of incoming) {
		const current = byId.get(message.id);
		byId.set(message.id, current ? { ...current, ...message } : message);
	}
	return [...byId.values()].sort(
		(a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
	);
}

export function latestMessageId(messages: ThreadMessage[]): string | null {
	if (messages.length === 0) return null;
	return messages[messages.length - 1]?.id ?? null;
}
