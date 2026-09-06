/** Privacy-safe sparkline height for a floored trend label (never reveals 1–4). */
export function sparklineValueFromTrendLabel(displayValue: string): number {
	const parsed = Number.parseInt(displayValue, 10);
	if (Number.isFinite(parsed)) return parsed;
	return 2;
}
