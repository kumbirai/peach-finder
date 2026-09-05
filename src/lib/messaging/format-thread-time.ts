/** Relative activity label for thread list rows (prototype-aligned). */
export function formatThreadActivityTime(iso: string, now = new Date()): string {
	const date = new Date(iso);
	const diffMs = now.getTime() - date.getTime();
	if (diffMs < 0) return 'Just now';
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days === 1) return 'Yesterday';
	if (days < 7) return `${days}d`;
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
