import { describe, expect, it } from 'vitest';
import {
	availabilitySummaryLabel,
	buildChartAnnotations,
	featuringSummaryLabel,
	wentAvailableMarkerLabel
} from './chart-annotations';

describe('chart-annotations', () => {
	it('builds availability and featuring summaries and day markers', () => {
		const rangeStart = new Date('2026-09-01T00:00:00.000Z');
		const rangeEnd = new Date('2026-09-08T00:00:00.000Z');
		const availabilityEvents = [
			{ occurredAt: new Date('2026-09-02T10:00:00.000Z') },
			{ occurredAt: new Date('2026-09-02T14:00:00.000Z') },
			{ occurredAt: new Date('2026-09-04T09:00:00.000Z') },
			{ occurredAt: new Date('2026-09-05T09:00:00.000Z') },
			{ occurredAt: new Date('2026-09-06T09:00:00.000Z') }
		];
		const featuringActivations = [{ activatedAt: new Date('2026-09-03T12:00:00.000Z') }];

		const view = buildChartAnnotations(
			7,
			rangeStart,
			rangeEnd,
			availabilityEvents,
			featuringActivations,
			new Date('2026-09-03T12:00:00.000Z')
		);

		expect(view.summaries).toEqual([
			{ type: 'went_available', label: 'Went available 5× this week' },
			{ type: 'featured', label: 'Featured since 3 Sep' }
		]);
		expect(view.markers).toContainEqual({
			date: '2026-09-02',
			type: 'went_available',
			label: 'Went available (2×)'
		});
		expect(view.markers).toContainEqual({
			date: '2026-09-03',
			type: 'featured',
			label: 'Featured'
		});
	});

	it('labels availability markers and summaries for longer ranges', () => {
		expect(availabilitySummaryLabel(3, 30)).toBe('Went available 3× the last 30 days');
		expect(wentAvailableMarkerLabel(1)).toBe('Went available');
		expect(featuringSummaryLabel(new Date('2026-09-12T00:00:00.000Z'))).toBe(
			'Featured since 12 Sep'
		);
	});
});
