export type PresenceBucket = 'online' | 'today' | 'this_week' | 'a_while_ago';

const ONLINE_WINDOW_MS = 90_000;

function dateKeyInTimeZone(date: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

function weekdayOffset(date: Date, timeZone: string): number {
	const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
	return weekday === 'Mon'
		? 0
		: weekday === 'Tue'
			? 1
			: weekday === 'Wed'
				? 2
				: weekday === 'Thu'
					? 3
					: weekday === 'Fri'
						? 4
						: weekday === 'Sat'
							? 5
							: 6;
}

function shiftDateKey(dateKey: string, days: number): string {
	const [year, month, day] = dateKey.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mondayDateKeyFor(date: Date, timeZone: string): string {
	const key = dateKeyInTimeZone(date, timeZone);
	return shiftDateKey(key, -weekdayOffset(date, timeZone));
}

export function bucketPresence(lastSeen: Date | null, now: Date, timeZone: string): PresenceBucket {
	if (!lastSeen) return 'a_while_ago';
	const ageMs = now.getTime() - lastSeen.getTime();
	if (ageMs <= ONLINE_WINDOW_MS) return 'online';

	const lastKey = dateKeyInTimeZone(lastSeen, timeZone);
	const nowKey = dateKeyInTimeZone(now, timeZone);
	if (lastKey === nowKey) return 'today';

	const weekStartKey = mondayDateKeyFor(now, timeZone);
	if (lastKey >= weekStartKey) return 'this_week';

	return 'a_while_ago';
}
