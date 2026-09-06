import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import {
	seedCore,
	SEED_CORE_PHONE_ON_NUMBER,
	SEED_DUAL_ROLE_EMAIL
} from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { getAccountSummary, searchAccounts } from './infra/account-lookup';

describe('US-ADMIN-05 account lookup integration', () => {
	it('TC-ADMIN-05a: search by display name, email, and phone', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const byName = await searchAccounts(db, 'Amara');
			expect(byName.some((row) => row.displayName === 'Amara T.')).toBe(true);

			const byPhone = await searchAccounts(db, SEED_CORE_PHONE_ON_NUMBER);
			expect(byPhone.some((row) => row.displayName === 'Amara T.')).toBe(true);

			const byEmail = await searchAccounts(db, SEED_DUAL_ROLE_EMAIL);
			expect(byEmail.some((row) => row.email === SEED_DUAL_ROLE_EMAIL)).toBe(true);
		});
	});

	it('does not treat % as an ILIKE wildcard', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const wildcard = await searchAccounts(db, '%');
			expect(wildcard).toEqual([]);
		});
	});

	it('getAccountSummary returns verification and capability flags', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const hit = (await searchAccounts(db, SEED_DUAL_ROLE_EMAIL))[0];
			expect(hit).toBeTruthy();
			const summary = await getAccountSummary(db, hit!.userId);
			expect(summary?.emailVerified).toBe(true);
			expect(summary?.isProvider).toBe(true);
			expect(summary?.isAdmin).toBe(false);
		});
	});
});
