import { describe, expect, it } from 'vitest';
import {
	chartAnnotationMarkerColor,
	chartAnnotationMarkerSymbol,
	demandTagOwnershipLabel,
	sparklineMarkerX,
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

	it('TC-ANLY-04a: maps annotation dates onto sparkline positions and symbols', () => {
		const dates = ['2026-09-01', '2026-09-02', '2026-09-03'];
		expect(sparklineMarkerX('2026-09-02', dates, 90)).toBe(45);
		expect(sparklineMarkerX('2026-09-10', dates, 90)).toBeNull();
		expect(chartAnnotationMarkerSymbol('went_available')).toBe('●');
		expect(chartAnnotationMarkerSymbol('featured')).toBe('◆');
		expect(chartAnnotationMarkerColor('went_available')).toBe('#B34625');
		expect(chartAnnotationMarkerColor('featured')).toBe('#2F5D50');
	});
});
