import { describe, expect, it } from 'vitest';
import { formatQueueAge, isQueueAgeOverdue, queueAgeHours } from './queue-age';

describe('queue-age', () => {
	const now = new Date('2026-09-06T12:00:00.000Z');

	it('formats minutes, hours, and days', () => {
		expect(formatQueueAge(new Date('2026-09-06T11:58:00.000Z'), now)).toBe('2 minutes ago');
		expect(formatQueueAge(new Date('2026-09-06T10:00:00.000Z'), now)).toBe('2 hours ago');
		expect(formatQueueAge(new Date('2026-09-03T12:00:00.000Z'), now)).toBe('3 days ago');
	});

	it('flags overdue after forty-eight hours', () => {
		const submitted = new Date('2026-09-03T11:00:00.000Z');
		expect(queueAgeHours(submitted, now)).toBeGreaterThan(48);
		expect(isQueueAgeOverdue(submitted, now)).toBe(true);
		expect(isQueueAgeOverdue(new Date('2026-09-05T12:00:00.000Z'), now)).toBe(false);
	});
});
