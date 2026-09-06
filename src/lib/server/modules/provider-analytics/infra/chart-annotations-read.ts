import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { listAvailabilityAnnotationEvents } from '../../provider-availability';
import {
	getActiveFeaturingActivatedAt,
	listFeaturingActivationsInRange
} from '../../listing-billing';
import { buildChartAnnotations } from '../domain/chart-annotations';
import type { DashboardRangeDays } from '../domain/metric-definitions';
import type { ChartAnnotationsView } from './serializers';

function startOfUtcDay(instant: Date): Date {
	return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

function addUtcDays(instant: Date, days: number): Date {
	const next = new Date(instant);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

export async function loadChartAnnotations(
	db: Database,
	providerProfileId: ProviderProfileId,
	rangeDays: DashboardRangeDays,
	now: Date
): Promise<ChartAnnotationsView> {
	const rangeEnd = addUtcDays(startOfUtcDay(now), 1);
	const rangeStart = addUtcDays(rangeEnd, -rangeDays);

	const [availabilityEvents, featuringActivations, activeFeaturingSince] = await Promise.all([
		listAvailabilityAnnotationEvents(db, providerProfileId, rangeStart, rangeEnd),
		listFeaturingActivationsInRange(db, providerProfileId, rangeStart, rangeEnd),
		getActiveFeaturingActivatedAt(db, providerProfileId)
	]);

	return buildChartAnnotations(
		rangeDays,
		rangeStart,
		rangeEnd,
		availabilityEvents,
		featuringActivations,
		activeFeaturingSince
	);
}
