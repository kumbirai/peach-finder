export function queueAgeSubLabel(hours: number | null, emptyLabel: string): string {
	if (hours === null) return emptyLabel;
	if (hours < 24) return `avg age ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
	const days = Math.round(hours / 24);
	return `avg age ${days} day${days === 1 ? '' : 's'}`;
}
