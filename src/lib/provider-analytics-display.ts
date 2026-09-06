/** Privacy-safe sparkline height for a floored trend label (never reveals 1–4). */
export function sparklineValueFromTrendLabel(displayValue: string): number {
	const parsed = Number.parseInt(displayValue, 10);
	if (Number.isFinite(parsed)) return parsed;
	return 2;
}

/** FR-ANLY-04 — client mirror of server demand-tag ownership labels (Never-Color-Alone). */
export function demandTagOwnershipLabel(isMine: boolean): string {
	return isMine ? 'Your tag' : 'Not on your profile';
}

export type ChartAnnotationMarkerView = {
	date: string;
	type: 'went_available' | 'featured';
	label: string;
};

/** Map an annotation date onto the sparkline x-axis (null when outside the trend window). */
export function sparklineMarkerX(
	markerDate: string,
	trendDates: string[],
	width: number
): number | null {
	const index = trendDates.indexOf(markerDate);
	if (index < 0) return null;
	if (trendDates.length <= 1) return width / 2;
	const step = width / (trendDates.length - 1);
	return index * step;
}

export function chartAnnotationMarkerSymbol(type: ChartAnnotationMarkerView['type']): string {
	return type === 'went_available' ? '●' : '◆';
}

export function chartAnnotationMarkerColor(type: ChartAnnotationMarkerView['type']): string {
	return type === 'went_available' ? '#B34625' : '#2F5D50';
}
