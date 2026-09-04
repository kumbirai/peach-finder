import { describe, expect, it } from 'vitest';
import { asInstant, FixedClock } from './clock';

describe('FixedClock', () => {
	it('returns the pinned instant and advances', () => {
		const clock = new FixedClock(asInstant('2026-09-04T18:00:00.000Z'));
		expect(clock.now()).toBe('2026-09-04T18:00:00.000Z');
		clock.advance(15_000);
		expect(clock.now()).toBe('2026-09-04T18:00:15.000Z');
	});
});
