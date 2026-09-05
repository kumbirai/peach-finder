import { describe, expect, it } from 'vitest';
import { remainingSeconds } from './availability-expiry-countdown';

describe('remainingSeconds', () => {
	it('returns null without an expiry timestamp', () => {
		expect(remainingSeconds(null, Date.now())).toBeNull();
	});

	it('returns zero when the window has passed', () => {
		const now = Date.parse('2026-09-06T12:00:00.000Z');
		expect(remainingSeconds('2026-09-06T11:59:00.000Z', now)).toBe(0);
	});

	it('ceilings partial seconds to the next whole second', () => {
		const now = Date.parse('2026-09-06T12:00:00.000Z');
		expect(remainingSeconds('2026-09-06T12:00:30.500Z', now)).toBe(31);
	});
});
