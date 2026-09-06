import { describe, expect, it } from 'vitest';
import { sparklineValueFromTrendLabel } from './provider-analytics-display';

describe('provider-analytics-display', () => {
	it('maps privacy-floored trend labels to a non-zero sparkline band', () => {
		expect(sparklineValueFromTrendLabel('< 5')).toBe(2);
		expect(sparklineValueFromTrendLabel('12')).toBe(12);
	});
});
