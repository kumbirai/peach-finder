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

	it('builds prior-period comparison labels from true counts when both are at or above the floor', () => {
		expect(buildComparison(10, 10).direction).toBe('flat');
		expect(buildComparison(10, 5).changeLabel).toBe('Up 100% vs prior period');
		expect(buildComparison(10, 5).direction).toBe('up');
		expect(buildComparison(8, 10).changeLabel).toBe('Down 20% vs prior period');
		expect(buildComparison(8, 10).direction).toBe('down');
	});

	it('TC-ANLY-02b: omits percentage labels when either count is below the privacy floor', () => {
		expect(buildComparison(3, 1).changeLabel).toBe('Up from prior period');
		expect(buildComparison(3, 1).priorTotal).toBe('< 5');
		expect(buildComparison(4, 2).changeLabel).toBe('Up from prior period');
		expect(buildComparison(2, 8).changeLabel).toBe('Down from prior period');
		expect(buildComparison(1, 0).changeLabel).toBe('Up from prior period');
	});
});
