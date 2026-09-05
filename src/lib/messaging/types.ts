export type OutboundDeliveryState = 'sent' | 'delivered' | 'read';

export type ThreadMessage = {
	id: string;
	threadId: string;
	body: string;
	sentAt: string;
	sender: { id: string; displayName: string };
	outboundDeliveryState: OutboundDeliveryState | null;
	deliveredAt: string | null;
	readAt: string | null;
};

export type WsServerMessage =
	| {
			type: 'connected';
			payload: { sessionId: string };
			sentAt: string;
	  }
	| {
			type: 'message.sent';
			payload: {
				threadId: string;
				messageId: string;
				senderId: string;
				bodyPreview: string;
				sentAt: string;
			};
			sentAt: string;
	  }
	| {
			type: 'message.delivered';
			payload: { threadId: string; messageId: string; deliveredAt: string };
			sentAt: string;
	  }
	| {
			type: 'message.read';
			payload: { threadId: string; messageId: string; readerId: string };
			sentAt: string;
	  }
	| {
			type: 'thread.typing';
			payload: { threadId: string };
			sentAt: string;
	  };
