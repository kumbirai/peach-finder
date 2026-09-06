export const DORMANT_THREAD_MONTHS = 24;

/** True when a thread's last activity is at or beyond the 24-month dormancy window. */
export function isDormantThread(lastActivityAt: Date, now: Date): boolean {
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - DORMANT_THREAD_MONTHS);
	return lastActivityAt.getTime() <= cutoff.getTime();
}
