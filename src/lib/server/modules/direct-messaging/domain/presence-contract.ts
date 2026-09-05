import type { PresenceBucket } from './presence-buckets';
import type { ResponseTimeBucket } from './response-time-bucket';

export const PRESENCE_BUCKETS = [
	'online',
	'today',
	'this_week',
	'a_while_ago'
] as const satisfies readonly PresenceBucket[];

export const RESPONSE_TIME_BUCKETS = [
	'within_30_min',
	'within_a_few_hours',
	'within_a_day'
] as const satisfies readonly ResponseTimeBucket[];

export function isCoarsePresenceBucket(value: string | null | undefined): value is PresenceBucket {
	return value != null && (PRESENCE_BUCKETS as readonly string[]).includes(value);
}

export function isCoarseResponseTimeBucket(
	value: string | null | undefined
): value is ResponseTimeBucket {
	return value != null && (RESPONSE_TIME_BUCKETS as readonly string[]).includes(value);
}
