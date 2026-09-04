export function queryRows(result: unknown): Array<Record<string, unknown>> {
	if (Array.isArray(result)) {
		return result as Array<Record<string, unknown>>;
	}
	if (
		result &&
		typeof result === 'object' &&
		'rows' in result &&
		Array.isArray((result as { rows: unknown }).rows)
	) {
		return (result as { rows: Array<Record<string, unknown>> }).rows;
	}
	return [];
}

export function affectedCount(result: unknown): number {
	if (result && typeof result === 'object' && 'count' in result) {
		return Number((result as { count: unknown }).count ?? 0);
	}
	return 0;
}
