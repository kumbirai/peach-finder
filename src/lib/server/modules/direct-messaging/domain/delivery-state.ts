export type OutboundDeliveryState = 'sent' | 'delivered' | 'read';

export function outboundDeliveryState(input: {
	deliveredAt: Date | null;
	readAt: Date | null;
}): OutboundDeliveryState {
	if (input.readAt) return 'read';
	if (input.deliveredAt) return 'delivered';
	return 'sent';
}

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

export function bodyPreview(body: string, max = 140): string {
	const trimmed = body.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max)}…`;
}
