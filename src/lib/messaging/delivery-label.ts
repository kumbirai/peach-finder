import type { OutboundDeliveryState } from './types';

export function deliveryStateLabel(state: OutboundDeliveryState): string {
	switch (state) {
		case 'sent':
			return 'Sent';
		case 'delivered':
			return 'Delivered';
		case 'read':
			return 'Read';
	}
}

export function applyDeliveryUpdate(
	message: {
		outboundDeliveryState: OutboundDeliveryState | null;
		deliveredAt: string | null;
		readAt: string | null;
	},
	kind: 'delivered' | 'read',
	at?: string
): void {
	if (kind === 'delivered') {
		message.deliveredAt = at ?? new Date().toISOString();
		message.outboundDeliveryState = message.readAt ? 'read' : 'delivered';
		return;
	}
	message.readAt = at ?? new Date().toISOString();
	message.outboundDeliveryState = 'read';
}
