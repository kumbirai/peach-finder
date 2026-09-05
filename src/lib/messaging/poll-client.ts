import type { ThreadMessage } from './types';

export type ThreadPollPayload = {
	messages: ThreadMessage[];
	deliveredUpdates: Array<{ messageId: string; deliveredAt: string }>;
	readUpdates: Array<{ messageId: string; readAt: string }>;
	cursor: string | null;
};

export async function fetchThreadPoll(
	threadId: string,
	since: string | null
): Promise<ThreadPollPayload | null> {
	const params = new URLSearchParams();
	if (since) params.set('since', since);
	const response = await fetch(`/api/messaging/threads/${threadId}/poll?${params.toString()}`, {
		credentials: 'same-origin'
	});
	if (!response.ok) return null;

	const json = (await response.json()) as {
		data: {
			messages: ThreadMessage[];
			deliveredUpdates: Array<{ messageId: string; deliveredAt: string }>;
			readUpdates: Array<{ messageId: string; readAt: string }>;
		};
		meta?: { nextCursor?: string | null };
	};

	return {
		messages: json.data.messages,
		deliveredUpdates: json.data.deliveredUpdates,
		readUpdates: json.data.readUpdates,
		cursor: json.meta?.nextCursor ?? since
	};
}
