import { describe, expect, it } from 'vitest';
import { bodyPreview, deliveryStateLabel, outboundDeliveryState } from './delivery-state';

describe('delivery-state', () => {
	it('progresses sent → delivered → read monotonically', () => {
		expect(outboundDeliveryState({ deliveredAt: null, readAt: null })).toBe('sent');
		expect(
			outboundDeliveryState({ deliveredAt: new Date('2026-09-05T12:00:00Z'), readAt: null })
		).toBe('delivered');
		expect(
			outboundDeliveryState({
				deliveredAt: new Date('2026-09-05T12:00:00Z'),
				readAt: new Date('2026-09-05T12:01:00Z')
			})
		).toBe('read');
	});

	it('labels states for Never-Color-Alone copy', () => {
		expect(deliveryStateLabel('sent')).toBe('Sent');
		expect(deliveryStateLabel('delivered')).toBe('Delivered');
		expect(deliveryStateLabel('read')).toBe('Read');
	});

	it('caps body preview length', () => {
		const long = 'a'.repeat(200);
		expect(bodyPreview(long)).toHaveLength(141);
		expect(bodyPreview(long).endsWith('…')).toBe(true);
	});
});
