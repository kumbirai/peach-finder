import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../db/test-harness';
import { consumeOtpRequestRateLimits } from './rate-limit';

describe('consumeOtpRequestRateLimits', () => {
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
