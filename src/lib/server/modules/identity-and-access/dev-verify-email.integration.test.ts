import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { registerSeeker, isEmailVerified, devVerifyEmailByAddress } from './infra/auth-commands';
import { clearDevStoresForTests, getDevVerificationToken } from './infra/dev-verification';

describe('devVerifyEmailByAddress', () => {
	it('verifies a freshly registered seeker when ALLOW_DEV_HELPERS is enabled', async () => {
		process.env.ALLOW_DEV_HELPERS = '1';
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const email = `dev-verify-${Date.now()}@example.com`;
			const now = new Date();
			const registered = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Dev Verify Seeker',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);
			expect(registered.ok).toBe(true);
			if (!registered.ok || !registered.value.userId) return;

			expect(await isEmailVerified(db, registered.value.userId)).toBe(false);
			expect(getDevVerificationToken(email)).toBeTruthy();

			const verified = await devVerifyEmailByAddress(db, email, now, 'test-corr-2');
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;
			expect(verified.value.alreadyVerified).toBe(false);
			expect(await isEmailVerified(db, registered.value.userId)).toBe(true);
		});
	});

	it('issues a fresh token when the in-memory dev store was cleared', async () => {
		process.env.ALLOW_DEV_HELPERS = '1';
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const email = `dev-verify-cleared-${Date.now()}@example.com`;
			const now = new Date();
			const registered = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Dev Verify Cleared',
					acceptedTerms: true
				},
				now,
				'test-corr-3'
			);
			expect(registered.ok).toBe(true);
			if (!registered.ok || !registered.value.userId) return;

			clearDevStoresForTests();
			expect(getDevVerificationToken(email)).toBeNull();

			const verified = await devVerifyEmailByAddress(db, email, now, 'test-corr-4');
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;
			expect(verified.value.alreadyVerified).toBe(false);
			expect(await isEmailVerified(db, registered.value.userId)).toBe(true);
		});
	});
});
