import { describe, expect, it } from 'vitest';
import {
	demandTagOwnershipLabel,
	sparklineValueFromTrendLabel
} from './provider-analytics-display';

describe('provider-analytics-display', () => {
	it('maps privacy-floored trend labels to a non-zero sparkline band', () => {
		expect(sparklineValueFromTrendLabel('< 5')).toBe(2);
		expect(sparklineValueFromTrendLabel('12')).toBe(12);
	});

	it('TC-ANLY-03a: exposes text ownership labels for demand tags', () => {
		expect(demandTagOwnershipLabel(true)).toBe('Your tag');
		expect(demandTagOwnershipLabel(false)).toBe('Not on your profile');
	});
});
