import { describe, expect, it } from 'vitest';
import { isDormantThread } from './dormant-thread-retention';

describe('dormant-thread-retention', () => {
	it('is dormant at exactly 24 months and not at 23 months', () => {
		const now = new Date('2026-09-06T12:00:00.000Z');
		const exactly24 = new Date(now);
		exactly24.setUTCMonth(exactly24.getUTCMonth() - 24);
		const at23 = new Date(now);
		at23.setUTCMonth(at23.getUTCMonth() - 23);

		expect(isDormantThread(exactly24, now)).toBe(true);
		expect(isDormantThread(at23, now)).toBe(false);
	});
});
