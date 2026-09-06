import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache, updateConfig, getConfig } from './index';
import { resetConfigCacheForTests } from './infra/config-cache';
import { users } from '../identity-and-access/infra/schema';
import { asId } from '../../shared/ids';
import { SystemClock } from '../../shared/clock';
import type { AuthContext } from '../../shared/auth-context';
import { createAuthContext } from '../../shared/auth-context';

const ADMIN_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000097');

function adminActor(): AuthContext {
	return createAuthContext({
		userId: ADMIN_ID,
		role: 'admin',
		sessionId: null,
		ipAddress: '127.0.0.1'
	});
}

describe('US-ADMIN-06 platform config updates integration', () => {
	it('TC-ADMIN-06a: admin config change is readable from cache immediately', async () => {
		resetConfigCacheForTests();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await db.insert(users).values({
				id: ADMIN_ID,
				displayName: 'Platform Admin',
				email: 'admin@example.com',
				isAdmin: true,
				status: 'active'
			});

			const result = await updateConfig(db, {
				key: 'listing-billing.trial_period_days',
				value: 21,
				actor: adminActor(),
				clock: new SystemClock(),
				correlationId: 'test-admin-06'
			});
			expect(result.ok).toBe(true);
			expect(getConfig('listing-billing.trial_period_days')).toBe(21);
		});
	}, 90_000);

	it('TC-ADMIN-06b: rejects reminder lead >= expiry', async () => {
		resetConfigCacheForTests();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await db.insert(users).values({
				id: ADMIN_ID,
				displayName: 'Platform Admin',
				email: 'admin@example.com',
				isAdmin: true,
				status: 'active'
			});

			const result = await updateConfig(db, {
				key: 'provider-availability.reminder_lead_minutes',
				value: 240,
				actor: adminActor(),
				clock: new SystemClock(),
				correlationId: 'test-admin-06b'
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe('validation_failed');
			}
			expect(getConfig('provider-availability.reminder_lead_minutes')).toBe(15);
		});
	}, 90_000);

	it('rejects editing computed active_week_window_days', async () => {
		resetConfigCacheForTests();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const result = await updateConfig(db, {
				key: 'provider-availability.active_week_window_days',
				value: 14,
				actor: adminActor(),
				clock: new SystemClock(),
				correlationId: 'test-admin-06-readonly'
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe('forbidden');
			}
		});
	}, 90_000);
});
