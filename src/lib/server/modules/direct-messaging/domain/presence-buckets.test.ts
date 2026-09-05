import { describe, expect, it } from 'vitest';
import { bucketPresence } from './presence-buckets';

const TZ = 'Africa/Johannesburg';

describe('bucketPresence', () => {
	it('returns online within the 90 second window', () => {
		const now = new Date('2026-09-05T12:00:00Z');
		const lastSeen = new Date('2026-09-05T11:59:30Z');
		expect(bucketPresence(lastSeen, now, TZ)).toBe('online');
	});

	it('returns today for activity earlier today', () => {
		const now = new Date('2026-09-05T18:00:00Z');
		const lastSeen = new Date('2026-09-05T08:00:00Z');
		expect(bucketPresence(lastSeen, now, TZ)).toBe('today');
	});

	it('returns a_while_ago when no activity exists', () => {
		const now = new Date('2026-09-05T12:00:00Z');
		expect(bucketPresence(null, now, TZ)).toBe('a_while_ago');
	});

	it('returns today for same calendar day in operating timezone near midnight boundary', () => {
		const now = new Date('2026-09-05T01:00:00Z');
		const lastSeen = new Date('2026-09-04T22:00:00Z');
		expect(bucketPresence(lastSeen, now, TZ)).toBe('today');
	});

	it('returns this_week for activity earlier in the same ISO week', () => {
		const now = new Date('2026-09-05T18:00:00Z');
		const lastSeen = new Date('2026-09-03T08:00:00Z');
		expect(bucketPresence(lastSeen, now, TZ)).toBe('this_week');
	});

	it('returns this_week for provider inactive for two days within the same calendar week', () => {
		const now = new Date('2026-09-05T12:00:00Z');
		const lastSeen = new Date('2026-09-03T12:00:00Z');
		expect(bucketPresence(lastSeen, now, TZ)).toBe('this_week');
	});

	it('returns today once the online window has elapsed on the same calendar day', () => {
		const now = new Date('2026-09-05T12:00:00Z');
		const lastSeen = new Date(now.getTime() - 91_000);
		expect(bucketPresence(lastSeen, now, TZ)).toBe('today');
	});

	it('does not treat future last-seen timestamps as online', () => {
		const now = new Date('2026-09-05T12:00:00Z');
		const lastSeen = new Date('2026-12-01T12:00:00Z');
		expect(bucketPresence(lastSeen, now, TZ)).not.toBe('online');
	});
});
