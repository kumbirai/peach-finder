import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../db/test-harness';
import { consumeOtpRequestRateLimits } from './rate-limit';

describe('consumeOtpRequestRateLimits', () => {
	it('uses separate bucket keys for hourly and daily phone limits at UTC midnight', async () => {
		await withTestDatabase(async (db) => {
			const midnight = new Date('2026-01-01T00:00:00.000Z');
			const phone = '+27823334455';
			const ip = '203.0.113.20';

			const first = await consumeOtpRequestRateLimits(db, { phone, ip }, midnight);
			expect(first.ok).toBe(true);

			const rows = await db.execute<{ bucket_key: string; count: number }>(sql`
				select bucket_key, count
				from shared.rate_limit_bucket
				where bucket_key like ${'otp_request:phone_%:' + phone}
				order by bucket_key
			`);
			const keys = rows as unknown as Array<{ bucket_key: string; count: number }>;
			expect(keys.map((r) => r.bucket_key)).toEqual([
				`otp_request:phone_day:${phone}`,
				`otp_request:phone_hour:${phone}`
			]);
			expect(keys.every((r) => r.count === 1)).toBe(true);
		});
	});

	it('blocks the fourth OTP send for the same phone within an hour (SR-INT-02)', async () => {
		await withTestDatabase(async (db) => {
			const now = new Date();
			const phone = '+27821112233';
			const ip = '203.0.113.10';

			for (let i = 0; i < 3; i++) {
				const allowed = await consumeOtpRequestRateLimits(db, { phone, ip }, now);
				expect(allowed.ok).toBe(true);
			}

			const blocked = await consumeOtpRequestRateLimits(db, { phone, ip }, now);
			expect(blocked.ok).toBe(false);
			if (!blocked.ok) {
				expect(blocked.error.kind).toBe('rate_limited');
			}
		});
	});
});
