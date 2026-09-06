const OVERDUE_HOURS = 48;

export function formatQueueAge(submittedAt: Date, now: Date): string {
	const diffMs = Math.max(0, now.getTime() - submittedAt.getTime());
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 60) {
		return minutes <= 1 ? 'Just now' : `${minutes} minutes ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
	}
	const days = Math.floor(hours / 24);
	return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function queueAgeHours(submittedAt: Date, now: Date): number {
	return Math.max(0, now.getTime() - submittedAt.getTime()) / 3_600_000;
}

export function isQueueAgeOverdue(submittedAt: Date, now: Date): boolean {
	return queueAgeHours(submittedAt, now) >= OVERDUE_HOURS;
}
