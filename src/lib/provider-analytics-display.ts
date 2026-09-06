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
