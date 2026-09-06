import type { DashboardRangeDays } from './metric-definitions';

export type ChartAnnotationType = 'went_available' | 'featured';

export type ChartAnnotationMarker = {
	date: string;
	type: ChartAnnotationType;
	label: string;
};

export type ChartAnnotationSummary = {
	type: ChartAnnotationType;
	label: string;
};

export type ChartAnnotationsView = {
	summaries: ChartAnnotationSummary[];
	markers: ChartAnnotationMarker[];
};

export type AvailabilityAnnotationInput = {
	occurredAt: Date;
};

export type FeaturingAnnotationInput = {
	activatedAt: Date;
};

function toUtcDayKey(instant: Date): string {
	return instant.toISOString().slice(0, 10);
}

const MONTHS_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
] as const;

function formatShortDate(instant: Date): string {
	return `${instant.getUTCDate()} ${MONTHS_SHORT[instant.getUTCMonth()]}`;
}

function rangePeriodLabel(rangeDays: DashboardRangeDays): string {
	if (rangeDays === 7) return 'this week';
	if (rangeDays === 30) return 'the last 30 days';
	return 'the last 90 days';
}

export function availabilitySummaryLabel(count: number, rangeDays: DashboardRangeDays): string {
	return `Went available ${count}× ${rangePeriodLabel(rangeDays)}`;
}

export function featuringSummaryLabel(activatedAt: Date): string {
	return `Featured since ${formatShortDate(activatedAt)}`;
}

export function wentAvailableMarkerLabel(countOnDay: number): string {
	return countOnDay > 1 ? `Went available (${countOnDay}×)` : 'Went available';
}

export function buildChartAnnotations(
	rangeDays: DashboardRangeDays,
	rangeStart: Date,
	rangeEnd: Date,
	availabilityEvents: ReadonlyArray<AvailabilityAnnotationInput>,
	featuringActivations: ReadonlyArray<FeaturingAnnotationInput>,
	activeFeaturingSince: Date | null
): ChartAnnotationsView {
	const summaries: ChartAnnotationSummary[] = [];
	const markers: ChartAnnotationMarker[] = [];

	const availabilityInRange = availabilityEvents.filter(
		(event) => event.occurredAt >= rangeStart && event.occurredAt < rangeEnd
	);
	if (availabilityInRange.length > 0) {
		summaries.push({
			type: 'went_available',
			label: availabilitySummaryLabel(availabilityInRange.length, rangeDays)
		});
	}

	const countsByDay = new Map<string, number>();
	for (const event of availabilityInRange) {
		const day = toUtcDayKey(event.occurredAt);
		countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
	}
	for (const [day, count] of [...countsByDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		markers.push({
			date: day,
			type: 'went_available',
			label: wentAvailableMarkerLabel(count)
		});
	}

	const featuringDates = new Set<string>();
	for (const activation of featuringActivations) {
		if (activation.activatedAt >= rangeStart && activation.activatedAt < rangeEnd) {
			featuringDates.add(toUtcDayKey(activation.activatedAt));
		}
	}

	const summaryFeaturingDate =
		activeFeaturingSince && activeFeaturingSince < rangeEnd ? activeFeaturingSince : null;
	if (summaryFeaturingDate) {
		summaries.push({
			type: 'featured',
			label: featuringSummaryLabel(summaryFeaturingDate)
		});
	}

	for (const activation of featuringActivations) {
		if (activation.activatedAt < rangeStart || activation.activatedAt >= rangeEnd) continue;
		const day = toUtcDayKey(activation.activatedAt);
		if (featuringDates.has(day)) {
			markers.push({
				date: day,
				type: 'featured',
				label: 'Featured'
			});
			featuringDates.delete(day);
		}
	}

	return { summaries, markers };
}
