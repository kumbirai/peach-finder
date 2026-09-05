import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../../db/test-harness';
import { seedCore } from '../../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { loadBadgeDisplayState } from './badge-read';
import { badgeState } from './schema';
import type { ProviderProfileId } from '../../../shared/ids';

describe('loadBadgeDisplayState', () => {
	it('hides identity badge when suppressed even if identity_verified remains true', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const profileId = '01900000-0000-7000-8000-000000000101' as ProviderProfileId;
			await db
				.update(badgeState)
				.set({
					suppressed: true,
					suppressedReason: 'Pending re-review',
					updatedAt: new Date()
				})
				.where(eq(badgeState.providerProfileId, profileId));

			const display = await loadBadgeDisplayState(db, profileId);
			expect(display.identityVerified).toBe(false);
			expect(display.activeThisWeek).toBe(true);
			expect(display.suppressed).toBe(true);
		});
	});
});
