import { describe, expect, it } from 'vitest';
import { applyDeliveryUpdate, deliveryStateLabel } from './delivery-label';

describe('delivery-label', () => {
	it('labels delivery states', () => {
		expect(deliveryStateLabel('sent')).toBe('Sent');
		expect(deliveryStateLabel('read')).toBe('Read');
	});

	it('updates outbound state monotonically', () => {
		const message = {
			outboundDeliveryState: 'sent' as const,
			deliveredAt: null as string | null,
			readAt: null as string | null
		};
		applyDeliveryUpdate(message, 'delivered', '2026-09-05T12:00:05Z');
		expect(message.outboundDeliveryState).toBe('delivered');
		applyDeliveryUpdate(message, 'read', '2026-09-05T12:01:00Z');
		expect(message.outboundDeliveryState).toBe('read');
	});
});
