import { sql } from 'drizzle-orm';
import type { Database } from '../db';
import { Err, Ok, type Result, type UseCaseError } from './result';
import { affectedCount, queryRows } from './sql-result';

export type RateLimitBucketName =
	| 'auth_login'
	| 'otp_request'
	| 'otp_verify_attempt'
	| 'password_reset_request'
	| 'admin_totp_verify'
	| 'message_send'
	| 'thread_create'
	| 'review_submit'
	| 'report_file'
	| 'search_query'
	| 'search_suggest'
	| 'availability_toggle'
	| 'register'
	| 'verify_email'
	| 'reset_complete'
	| 'verification_submit';

export type BucketSpec = {
	name: RateLimitBucketName;
	windowMs: number;
	limit: number;
};

export const RATE_LIMIT_BUCKETS: readonly BucketSpec[] = [
	{ name: 'auth_login', windowMs: 15 * 60_000, limit: 20 },
	{ name: 'otp_request', windowMs: 60 * 60_000, limit: 3 },
	{ name: 'otp_verify_attempt', windowMs: 10 * 60_000, limit: 5 },
	{ name: 'password_reset_request', windowMs: 60 * 60_000, limit: 5 },
	{ name: 'admin_totp_verify', windowMs: 10 * 60_000, limit: 5 },
	{ name: 'message_send', windowMs: 60_000, limit: 30 },
	{ name: 'thread_create', windowMs: 60 * 60_000, limit: 20 },
	{ name: 'review_submit', windowMs: 24 * 60 * 60_000, limit: 10 },
	{ name: 'report_file', windowMs: 60 * 60_000, limit: 10 },
	{ name: 'search_query', windowMs: 60_000, limit: 60 },
	{ name: 'search_suggest', windowMs: 60_000, limit: 120 },
	{ name: 'availability_toggle', windowMs: 60_000, limit: 30 },
	{ name: 'register', windowMs: 60 * 60_000, limit: 5 },
	{ name: 'verify_email', windowMs: 60 * 60_000, limit: 20 },
	{ name: 'reset_complete', windowMs: 60 * 60_000, limit: 10 },
	{ name: 'verification_submit', windowMs: 60 * 60_000, limit: 5 }
];

export function bucketSpec(
	name: RateLimitBucketName,
	windowMs?: number,
	limit?: number
): BucketSpec {
	const found = RATE_LIMIT_BUCKETS.find((b) => b.name === name);
	if (!found) throw new Error(`Unknown rate-limit bucket ${name}`);
	return {
		name,
		windowMs: windowMs ?? found.windowMs,
		limit: limit ?? found.limit
	};
}

/** SR-INT-02 / security-implementation.md §5.2 — phone 3/h & 10/day, IP 10/h. */
export async function consumeOtpRequestRateLimits(
	db: Database,
	input: { phone: string; ip: string },
	now: Date
): Promise<Result<void, UseCaseError>> {
	const ipLimited = await consumeRateLimit(
		db,
		bucketSpec('otp_request', 60 * 60_000, 10),
		`ip:${input.ip}`,
		now
	);
	if (!ipLimited.ok) return ipLimited;

	const phoneHour = await consumeRateLimit(
		db,
		bucketSpec('otp_request', 60 * 60_000, 3),
		`phone:${input.phone}`,
		now
	);
	if (!phoneHour.ok) return phoneHour;

	return consumeRateLimit(
		db,
		bucketSpec('otp_request', 24 * 60 * 60_000, 10),
		`phone:${input.phone}`,
		now
	);
}

export async function consumeRateLimit(
	db: Database,
	spec: BucketSpec,
	key: string,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const windowStart = truncateWindow(now, spec.windowMs);
	const bucketKey = `${spec.name}:${key}`;
	const rows = queryRows(
		await db.execute(sql`
			insert into shared.rate_limit_bucket (bucket_key, window_start, count)
			values (${bucketKey}, ${windowStart.toISOString()}::timestamptz, 1)
			on conflict (bucket_key, window_start)
			do update set count = shared.rate_limit_bucket.count + 1
			returning count
		`)
	);
	const count = Number(rows[0]?.count ?? 0);
	if (count > spec.limit) {
		const retryAfterSeconds = Math.max(
			1,
			Math.ceil((windowStart.getTime() + spec.windowMs - now.getTime()) / 1000)
		);
		return Err({ kind: 'rate_limited', retryAfterSeconds });
	}
	return Ok(undefined);
}

export async function cleanupRateLimitBuckets(db: Database, now: Date): Promise<number> {
	const cutoff = new Date(now.getTime() - 48 * 60 * 60_000);
	const result = await db.execute(sql`
		delete from shared.rate_limit_bucket
		where window_start < ${cutoff.toISOString()}::timestamptz
	`);
	return affectedCount(result);
}

function truncateWindow(now: Date, windowMs: number): Date {
	const ms = now.getTime();
	return new Date(ms - (ms % windowMs));
}
