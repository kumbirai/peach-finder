import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PHONE_OFF_PROFILE_ID,
	SEED_VIEW02_THANDI_ACTIVITY_AT
} from '../../../../../scripts/seed-core';
import { getPresence, getResponseTime, upsertPresenceHeartbeat } from '../direct-messaging';
import { asId } from '../../shared/ids';

const THANDI_USER_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000002');
const AMARA_PROFILE_ID = asId<'ProviderProfileId'>('01900000-0000-7000-8000-000000000101');

describe('direct-messaging presence-read integration', () => {
	it('uses the later of heartbeat and latest message activity for presence', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-05T12:00:00Z');
			const freshHeartbeatAt = new Date('2026-09-05T11:59:30Z');

			expect(SEED_VIEW02_THANDI_ACTIVITY_AT.getTime()).toBeLessThan(now.getTime());
			expect(await getPresence(db, THANDI_USER_ID, now)).toBe('this_week');

			await upsertPresenceHeartbeat(db, THANDI_USER_ID, freshHeartbeatAt);

			expect(await getPresence(db, THANDI_USER_ID, now)).toBe('online');
		});
	});

	it('returns null response time when fewer than three first-reply samples exist', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const thandiProfileId = asId<'ProviderProfileId'>(SEED_CORE_PHONE_OFF_PROFILE_ID);
			expect(await getResponseTime(db, thandiProfileId)).toBeNull();
			expect(await getResponseTime(db, AMARA_PROFILE_ID)).toBe('within_30_min');
		});
	});
});
