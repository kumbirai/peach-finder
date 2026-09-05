import type { WsServerMessage } from './types';

const BACKOFF_MS = [1000, 2000, 4000, 8000, 30000];
const POLL_INTERVAL_MS = 4000;
const HEARTBEAT_MS = 30_000;
const MAX_RECONNECT_BEFORE_POLL = 3;

export type MessagingTransportHandlers = {
	onServerMessage: (message: WsServerMessage) => void;
	onPollMessages: (payload: {
		messages: Array<Record<string, unknown>>;
		deliveredUpdates: Array<{ messageId: string; deliveredAt: string }>;
		readUpdates: Array<{ messageId: string; readAt: string }>;
		cursor: string | null;
	}) => void;
	onConnectionModeChange?: (mode: 'websocket' | 'polling') => void;
};

export class MessagingTransport {
	private ws: WebSocket | null = null;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private pollCursor: string | null = null;
	private threadId: string | null = null;
	private mode: 'websocket' | 'polling' = 'websocket';
	private forcePolling = false;

	constructor(private readonly handlers: MessagingTransportHandlers) {}

	start(threadId: string, sinceMessageId?: string | null): void {
		this.threadId = threadId;
		this.pollCursor = sinceMessageId ?? null;
		if (this.forcePolling) {
			this.enterPollingMode();
			return;
		}
		this.connectWebSocket();
	}

	stop(): void {
		this.clearTimers();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	setForcePolling(force: boolean): void {
		this.forcePolling = force;
		if (force) {
			if (this.ws) this.ws.close();
			this.enterPollingMode();
		}
	}

	sendHeartbeat(): void {
		this.send({ type: 'presence.heartbeat', payload: {} });
	}

	ackMessageReceived(threadId: string, messageId: string): void {
		this.send({ type: 'message.received', payload: { threadId, messageId } });
	}

	sendTyping(threadId: string): void {
		this.send({ type: 'thread.typing', payload: { threadId } });
	}

	private send(payload: Record<string, unknown>): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(payload));
		}
	}

	private connectWebSocket(): void {
		if (typeof WebSocket === 'undefined' || !this.threadId) return;

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/ws`;

		try {
			this.ws = new WebSocket(url);
		} catch {
			this.scheduleReconnect();
			return;
		}

		this.ws.addEventListener('open', () => {
			this.reconnectAttempt = 0;
			this.setMode('websocket');
			this.startHeartbeat();
		});

		this.ws.addEventListener('message', (event) => {
			try {
				const parsed = JSON.parse(String(event.data)) as WsServerMessage;
				this.handlers.onServerMessage(parsed);
			} catch {
				// ignore malformed frames
			}
		});

		this.ws.addEventListener('close', () => {
			this.stopHeartbeat();
			this.scheduleReconnect();
		});

		this.ws.addEventListener('error', () => {
			this.ws?.close();
		});
	}

	private scheduleReconnect(): void {
		if (!this.threadId) return;
		this.reconnectAttempt += 1;
		if (this.reconnectAttempt > MAX_RECONNECT_BEFORE_POLL) {
			this.enterPollingMode();
			return;
		}
		const delay =
			BACKOFF_MS[Math.min(this.reconnectAttempt - 1, BACKOFF_MS.length - 1)]! +
			Math.floor(Math.random() * 250);
		this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
	}

	private enterPollingMode(): void {
		this.setMode('polling');
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		void this.pollOnce();
		if (!this.pollTimer) {
			this.pollTimer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
		}
	}

	private async pollOnce(): Promise<void> {
		if (!this.threadId) return;
		const params = new URLSearchParams();
		if (this.pollCursor) params.set('since', this.pollCursor);
		const response = await fetch(
			`/api/messaging/threads/${this.threadId}/poll?${params.toString()}`,
			{ credentials: 'same-origin' }
		);
		if (!response.ok) return;
		const json = (await response.json()) as {
			data: {
				messages: Array<Record<string, unknown>>;
				deliveredUpdates: Array<{ messageId: string; deliveredAt: string }>;
				readUpdates: Array<{ messageId: string; readAt: string }>;
			};
			meta?: { nextCursor?: string | null };
		};
		const cursor = json.meta?.nextCursor ?? this.pollCursor;
		this.pollCursor = cursor;
		this.handlers.onPollMessages({
			messages: json.data.messages,
			deliveredUpdates: json.data.deliveredUpdates,
			readUpdates: json.data.readUpdates,
			cursor
		});
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.sendHeartbeat();
		this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_MS);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private clearTimers(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		this.stopHeartbeat();
	}

	private setMode(mode: 'websocket' | 'polling'): void {
		if (this.mode === mode) return;
		this.mode = mode;
		this.handlers.onConnectionModeChange?.(mode);
	}
}
