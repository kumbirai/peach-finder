import { describe, expect, it } from 'vitest';
import { outboxClaimPriority } from './outbox-claim-priority';

describe('outbox claim priority', () => {
	it('drains block-cache events before actor-attributed notifications', () => {
		expect(outboxClaimPriority('UserBlocked')).toBeLessThan(outboxClaimPriority('ReviewSubmitted'));
		expect(outboxClaimPriority('UserUnblocked')).toBeLessThan(outboxClaimPriority('MessageSent'));
		expect(outboxClaimPriority('ReviewSubmitted')).toBe(outboxClaimPriority('PaymentSucceeded'));
	});
});
