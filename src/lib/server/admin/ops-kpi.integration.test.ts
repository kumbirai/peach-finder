import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../db/test-harness';
import { seedReports } from '../../../../scripts/seed-reports';
import { seedVerification } from '../../../../scripts/seed-verification';
import { seedPlatform, loadConfigCache } from '../modules/platform-configuration';
import { loadOpsKpis, parseRegistrationRangeParam } from './ops-kpi';

describe('US-ADMIN-08 ops KPI read model', () => {
	it('parseRegistrationRangeParam defaults to 7 days', () => {
		const now = new Date('2026-09-06T12:00:00.000Z');
		const range = parseRegistrationRangeParam(null, now);
		expect(range.label).toBe('last 7 days');
		expect(range.to).toEqual(now);
		expect(range.from.toISOString()).toBe('2026-08-30T12:00:00.000Z');
	});

	it('TC-ADMIN-08a: dashboard aggregates match seeded queue state', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedVerification(db);
			await seedReports(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const kpis = await loadOpsKpis(db, now, '7d');

			expect(kpis.identityQueue.pendingCount).toBe(2);
			expect(kpis.reportsQueue.openCount).toBe(4);
			expect(kpis.activeListings).toBeGreaterThan(0);
			expect(kpis.registrations.count).toBeGreaterThan(0);
		});
	});
});
