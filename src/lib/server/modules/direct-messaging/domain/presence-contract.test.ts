import { describe, expect, it } from 'vitest';
import {
	isCoarsePresenceBucket,
	isCoarseResponseTimeBucket,
	PRESENCE_BUCKETS,
	RESPONSE_TIME_BUCKETS
} from './presence-contract';

describe('presence-contract', () => {
	it('recognises coarse presence buckets only', () => {
		for (const bucket of PRESENCE_BUCKETS) {
			expect(isCoarsePresenceBucket(bucket)).toBe(true);
		}
		expect(isCoarsePresenceBucket('2026-09-03T10:00:00.000Z')).toBe(false);
		expect(isCoarsePresenceBucket('last_seen')).toBe(false);
		expect(isCoarsePresenceBucket(null)).toBe(false);
	});

	it('recognises coarse response-time buckets only', () => {
		for (const bucket of RESPONSE_TIME_BUCKETS) {
			expect(isCoarseResponseTimeBucket(bucket)).toBe(true);
		}
		expect(isCoarseResponseTimeBucket('within_5_min')).toBe(false);
		expect(isCoarseResponseTimeBucket(null)).toBe(false);
	});
});
