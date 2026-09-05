const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Relative phrase for an availability timestamp (SR-APP-09 / FR-AVAIL-05). */
export function formatRecencyPhrase(setAt: string, now: Date = new Date()): string {
	const then = new Date(setAt);
	const diffMs = Math.max(0, now.getTime() - then.getTime());
	const diffMinutes = Math.floor(diffMs / MINUTE_MS);

	if (diffMinutes < 1) return 'just now';
	if (diffMinutes < 60) return `${diffMinutes} min ago`;

	const diffHours = Math.floor(diffMs / HOUR_MS);
	if (diffHours < 24) return `${diffHours} hr ago`;

	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

/** Full availability pill copy for cards and profiles. */
export function availabilityPillLabel(setAt: string | null, now: Date = new Date()): string {
	if (!setAt) return 'Available now';
	return `Available now — updated ${formatRecencyPhrase(setAt, now)}`;
}
