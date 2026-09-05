import { describe, expect, it } from 'vitest';
import { formatThreadActivityTime } from './format-thread-time';

describe('formatThreadActivityTime', () => {
	const now = new Date('2026-09-05T15:00:00Z');

	it('labels recent activity in minutes', () => {
		expect(formatThreadActivityTime('2026-09-05T14:58:00Z', now)).toBe('2m');
	});

	it('labels yesterday', () => {
		expect(formatThreadActivityTime('2026-09-04T10:00:00Z', now)).toBe('Yesterday');
	});
});
