import { describe, expect, it } from 'vitest';
import { bucketResponseTime, median } from './response-time-bucket';

describe('response-time-bucket', () => {
	it('computes median latency samples', () => {
		expect(median([10, 20, 30])).toBe(20);
		expect(median([10, 20, 30, 40])).toBe(25);
	});

	it('maps median latency to buckets', () => {
		expect(bucketResponseTime(15 * 60_000)).toBe('within_30_min');
		expect(bucketResponseTime(2 * 60 * 60_000)).toBe('within_a_few_hours');
		expect(bucketResponseTime(12 * 60 * 60_000)).toBe('within_a_day');
		expect(bucketResponseTime(48 * 60 * 60_000)).toBeNull();
	});
});
