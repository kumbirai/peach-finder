import { describe, expect, it } from 'vitest';
import { asId } from '../../../shared/ids';
import { toMessageDTO } from './serializers';

describe('direct-messaging serializers', () => {
	it('shows outbound delivery state only for the sender', () => {
		const viewerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
		const dto = toMessageDTO(
			{
				id: 'msg-1',
				threadId: 'thread-1',
				body: 'Hello',
				sentAt: new Date('2026-09-05T12:00:00Z'),
				senderId: viewerId,
				deliveredAt: new Date('2026-09-05T12:00:05Z'),
				readAt: null,
				isDeletedSenderAccount: false
			},
			viewerId,
			'Amara T.'
		);
		expect(dto.outboundDeliveryState).toBe('delivered');
	});

	it('masks deleted senders', () => {
		const viewerId = asId<'UserId'>('01900000-0000-7000-8000-000000000002');
		const dto = toMessageDTO(
			{
				id: 'msg-2',
				threadId: 'thread-1',
				body: 'Hi',
				sentAt: new Date('2026-09-05T12:00:00Z'),
				senderId: '01900000-0000-7000-8000-000000000099',
				deliveredAt: null,
				readAt: null,
				isDeletedSenderAccount: true
			},
			viewerId,
			'Should not leak'
		);
		expect(dto.sender.displayName).toBe('Deleted account');
		expect(dto.outboundDeliveryState).toBeNull();
	});
});
