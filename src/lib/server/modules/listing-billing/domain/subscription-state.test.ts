import { describe, expect, it } from 'vitest';
import {
	addDaysUtc,
	dayInGrace,
	emitsSubscriptionActivated,
	resolveFailedPaymentTransition,
	resolvePaymentTransition
} from './subscription-state';

describe('subscription-state domain', () => {
	it('resolves payment transitions by current listing state', () => {
		expect(resolvePaymentTransition('free_listed')).toBe('payment_from_free_listed');
		expect(resolvePaymentTransition('paid_listed')).toBe('payment_from_paid_listed');
		expect(resolvePaymentTransition('grace')).toBe('payment_from_grace');
		expect(resolvePaymentTransition('unpublished')).toBe('payment_from_unpublished');
		expect(resolvePaymentTransition('building')).toBeNull();
	});

	it('only allows failed-payment transition from paid_listed', () => {
		expect(resolveFailedPaymentTransition('paid_listed')).toBe('paid_listed_to_grace');
		expect(resolveFailedPaymentTransition('grace')).toBeNull();
	});

	it('computes day-in-grace for dunning offsets', () => {
		const graceEndsAt = new Date('2026-09-08T12:00:00.000Z');
		const now = new Date('2026-09-02T12:00:00.000Z');
		expect(dayInGrace(graceEndsAt, 7, now)).toBe(2);
	});

	it('emits SubscriptionActivated only on first paid transitions', () => {
		expect(emitsSubscriptionActivated('payment_from_free_listed')).toBe(true);
		expect(emitsSubscriptionActivated('payment_from_grace')).toBe(true);
		expect(emitsSubscriptionActivated('payment_from_unpublished')).toBe(true);
		expect(emitsSubscriptionActivated('payment_from_paid_listed')).toBe(false);
	});

	it('adds UTC days for grace end calculation', () => {
		const start = new Date('2026-09-01T00:00:00.000Z');
		expect(addDaysUtc(start, 7).toISOString()).toBe('2026-09-08T00:00:00.000Z');
	});
});
