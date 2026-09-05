import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../../platform-configuration';
import { registerSeeker } from './auth-commands';

describe('registerSeeker', () => {
	it('does not return userId when email already exists (anti-enumeration)', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `dup-${Date.now()}@example.com`;
			const first = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'First User',
					acceptedTerms: true
				},
				now,
				'test-corr-1'
			);
			expect(first.ok).toBe(true);
			if (!first.ok) return;
			expect(first.value.accountCreated).toBe(true);
			expect(first.value.userId).toBeTruthy();

			const second = await registerSeeker(
				db,
				{
					email,
					password: 'different-password',
					displayName: 'Attacker',
					acceptedTerms: true
				},
				now,
				'test-corr-2'
			);
			expect(second.ok).toBe(true);
			if (!second.ok) return;
			expect(second.value.accountCreated).toBe(false);
			expect(second.value.userId).toBeUndefined();
			expect(second.value.emailVerificationSent).toBe(true);
		});
	});
});
