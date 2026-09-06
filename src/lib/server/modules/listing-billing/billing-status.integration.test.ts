import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import {
	seedCore,
	SEED_DUAL_ROLE_USER_ID,
	SEED_TRIAL_ENDS_AT
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { getBillingStatusForOwner } from './app/get-billing-status-for-owner';
import { asId } from '../../shared/ids';

describe('US-BILL-01 billing status integration', () => {
	it('TC-BILL-01b: returns free-period end date and what happens next for a seeded provider', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const status = await getBillingStatusForOwner(db, asId<'UserId'>(SEED_DUAL_ROLE_USER_ID));

			expect(status?.state).toBe('free_listed');
			expect(status?.trialEndsAt).toBe(SEED_TRIAL_ENDS_AT.toISOString());
			expect(status?.dashboard?.headline).toBe('Free listing period');
			expect(status?.dashboard?.endDateLabel).toContain('September');
			expect(status?.dashboard?.whatHappensNext).toContain('grace period');
			expect(status?.dashboard?.whatHappensNext).toContain('hidden from search');
		});
	});
});
