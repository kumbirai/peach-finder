import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import {
	forceConfigTtlElapsed,
	getConfig,
	loadConfigCache,
	maybeRefreshAll,
	overwriteCachedConfig,
	resetConfigCacheForTests,
	seedPlatform,
	updateConfig
} from './index';
import { users } from '../identity-and-access/infra/schema';
import { asId } from '../../shared/ids';
import { SystemClock } from '../../shared/clock';
import { createAuthContext } from '../../shared/auth-context';

const ADMIN_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000097');

describe('config cache TTL backstop', () => {
	it('reloads from the database after the 5-minute TTL even when ConfigChanged is dropped', async () => {
		resetConfigCacheForTests();
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await db.insert(users).values({
				id: ADMIN_ID,
				displayName: 'Platform Admin',
				email: 'admin-ttl@example.com',
				isAdmin: true,
				status: 'active'
			});

			const prior = getConfig('listing-billing.listing_price_cents');
			const result = await updateConfig(db, {
				key: 'listing-billing.listing_price_cents',
				value: prior === 9900 ? 8800 : 9900,
				actor: createAuthContext({
					userId: ADMIN_ID,
					role: 'admin',
					sessionId: null,
					ipAddress: '127.0.0.1'
				}),
				clock: new SystemClock(),
				correlationId: 'ttl-backstop'
			});
			expect(result.ok).toBe(true);

			overwriteCachedConfig('listing-billing.listing_price_cents', prior);
			expect(getConfig('listing-billing.listing_price_cents')).toBe(prior);

			forceConfigTtlElapsed();
			await maybeRefreshAll(db);
			expect(getConfig('listing-billing.listing_price_cents')).not.toBe(prior);
		});
	}, 90_000);
});
