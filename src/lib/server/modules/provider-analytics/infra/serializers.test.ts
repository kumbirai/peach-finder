import { describe, expect, it } from 'vitest';
import { formatCount, buildComparison } from './serializers';

describe('provider-analytics serializers', () => {
	it('TC-ANLY-02b: floors counts below 5 for provider display', () => {
		expect(formatCount(0)).toBe('< 5');
		expect(formatCount(3)).toBe('< 5');
		expect(formatCount(4)).toBe('< 5');
		expect(formatCount(5)).toBe('5');
		expect(formatCount(42)).toBe('42');
	});

	it('builds prior-period comparison labels from true counts', () => {
		expect(buildComparison(10, 10).direction).toBe('flat');
		expect(buildComparison(10, 5).direction).toBe('up');
		expect(buildComparison(2, 8).direction).toBe('down');
	});
});
