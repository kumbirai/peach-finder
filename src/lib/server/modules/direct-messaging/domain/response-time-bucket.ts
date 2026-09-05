export type ResponseTimeBucket = 'within_30_min' | 'within_a_few_hours' | 'within_a_day';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1]! + sorted[mid]!) / 2;
	}
	return sorted[mid]!;
}

export function bucketResponseTime(medianMs: number): ResponseTimeBucket | null {
	if (medianMs <= 30 * MINUTE_MS) return 'within_30_min';
	if (medianMs <= 6 * HOUR_MS) return 'within_a_few_hours';
	if (medianMs <= 24 * HOUR_MS) return 'within_a_day';
	return null;
}
