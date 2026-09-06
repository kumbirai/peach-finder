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

			const now = new Date('2026-09-06T12:00:00.000Z');
			const from = new Date('2026-09-01T00:00:00.000Z');

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
