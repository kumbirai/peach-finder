import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PHONE_OFF_PROFILE_ID,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../../../../scripts/seed-core';
import { getPublicProfile } from '../provider-profile';
import { anonymousAuth } from '../../shared/auth-context';
import { asId } from '../../shared/ids';
import {
	isCoarsePresenceBucket,
	isCoarseResponseTimeBucket
} from '../direct-messaging/domain/presence-contract';

describe('US-VIEW-02 honest presence integration', () => {
	it('TC-VIEW-02a: API exposes coarse presence buckets only, never exact last-seen timestamps', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const profile = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PHONE_OFF_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(profile.ok).toBe(true);
			if (!profile.ok) throw new Error('profile missing');

			expect(isCoarsePresenceBucket(profile.value.onlineStatus)).toBe(true);
			expect(profile.value.onlineStatus).not.toBe('online');
			expect(['today', 'this_week', 'a_while_ago']).toContain(profile.value.onlineStatus);

			const serialized = JSON.stringify(profile.value);
			expect(serialized).not.toMatch(/lastSeen|last_seen|lastActive|last_active/);
			expect(serialized).not.toMatch(/"onlineStatus"\s*:\s*"\d{4}-\d{2}-\d{2}/);
		});
	});

	it('TC-VIEW-02b: providers with insufficient reply history expose no response-time claim', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const sparse = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PHONE_OFF_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(sparse.ok).toBe(true);
			if (!sparse.ok) throw new Error('profile missing');
			expect(sparse.value.responseTime).toBeNull();

			const rich = await getPublicProfile(
				db,
				asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID),
				anonymousAuth('127.0.0.1')
			);
			expect(rich.ok).toBe(true);
			if (!rich.ok) throw new Error('profile missing');
			expect(isCoarseResponseTimeBucket(rich.value.responseTime)).toBe(true);
		});
	});
});
