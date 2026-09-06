import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { users } from './infra/schema';
import { getRegistrationStats } from './infra/registration-stats';

describe('US-ADMIN-08 getRegistrationStats integration', () => {
	it('TC-ADMIN-08a: counts users created within the requested range', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			// seed rows get createdAt = DB now(); anchor the window on the real
			// clock (plus a small buffer) so it always contains the seeded users.
			const now = new Date(Date.now() + 60_000);
			const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

			const stats = await getRegistrationStats(db, { from, to: now });
			expect(stats.count).toBeGreaterThan(0);

			const allUsers = await db.select({ createdAt: users.createdAt }).from(users);
			const expected = allUsers.filter(
				(row) => row.createdAt >= from && row.createdAt < now
			).length;
			expect(stats.count).toBe(expected);
		});
	});
});
