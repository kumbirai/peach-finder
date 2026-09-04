import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	changePassword,
	completePasswordReset,
	findActiveSession,
	hashSessionToken,
	loginPassword,
	registerSeeker,
	requestPasswordReset
} from './index';
import { createSession, revokeSession } from './infra/session-commands';
import { PASSWORD_RESET_TTL_MS } from './domain/session-policy';

describe('US-ACC-03 stay signed in integration', () => {
	it('TC-ACC-03c: reset token is single-use', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `reset-${Date.now()}@example.com`;
			await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Reset User',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);

			const requested = await requestPasswordReset(db, email, now);
			expect(requested.ok).toBe(true);
			if (!requested.ok || !requested.value.resetToken) return;

			const first = await completePasswordReset(
				db,
				requested.value.resetToken,
				'newpassword123',
				now
			);
			expect(first.ok).toBe(true);

			const second = await completePasswordReset(
				db,
				requested.value.resetToken,
				'anotherpass123',
				now
			);
			expect(second.ok).toBe(false);
			if (second.ok) return;
			expect(second.error.kind).toBe('not_found');

			const login = await loginPassword(db, { email, password: 'newpassword123' });
			expect(login.ok).toBe(true);
		});
	});

	it('TC-ACC-03c: concurrent password reset completes exactly once', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `race-reset-${Date.now()}@example.com`;
			await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Race Reset User',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);

			const requested = await requestPasswordReset(db, email, now);
			expect(requested.ok).toBe(true);
			if (!requested.ok || !requested.value.resetToken) return;

			const [first, second] = await Promise.all([
				completePasswordReset(db, requested.value.resetToken, 'newpassword123', now),
				completePasswordReset(db, requested.value.resetToken, 'anotherpass123', now)
			]);

			const outcomes = [first, second];
			expect(outcomes.filter((result) => result.ok).length).toBe(1);
			expect(
				outcomes.filter((result) => !result.ok && result.error.kind === 'not_found').length
			).toBe(1);
		});
	});

	it('TC-ACC-03c: expired reset token is rejected', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `expired-reset-${Date.now()}@example.com`;
			await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Expired Reset User',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);

			const requested = await requestPasswordReset(db, email, now);
			expect(requested.ok).toBe(true);
			if (!requested.ok || !requested.value.resetToken) return;

			const expiredAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS + 1);
			const result = await completePasswordReset(
				db,
				requested.value.resetToken,
				'newpassword123',
				expiredAt
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.kind).toBe('not_found');
		});
	});

	it('TC-ACC-03b/03d: sign-out and password change isolate sessions correctly', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `sessions-${Date.now()}@example.com`;
			const reg = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Session User',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.userId) return;

			const sessionA = await createSession(db, {
				userId: reg.value.userId,
				ipAddress: '127.0.0.1',
				userAgent: 'device-a',
				now
			});
			const sessionB = await createSession(db, {
				userId: reg.value.userId,
				ipAddress: '127.0.0.1',
				userAgent: 'device-b',
				now
			});

			expect(await findActiveSession(db, sessionA.token, now)).not.toBeNull();
			expect(await findActiveSession(db, sessionB.token, now)).not.toBeNull();

			await revokeSession(db, sessionA.sessionId, now);
			expect(await findActiveSession(db, sessionA.token, now)).toBeNull();
			expect(await findActiveSession(db, sessionB.token, now)).not.toBeNull();

			const changed = await changePassword(
				db,
				{
					userId: reg.value.userId,
					sessionId: sessionB.sessionId,
					currentPassword: 'password123',
					newPassword: 'updatedpass123'
				},
				now,
				'test-corr-2'
			);
			expect(changed.ok).toBe(true);
			expect(await findActiveSession(db, sessionB.token, now)).not.toBeNull();

			const sessionC = await createSession(db, {
				userId: reg.value.userId,
				ipAddress: '127.0.0.1',
				userAgent: 'device-c',
				now
			});
			expect(await findActiveSession(db, sessionC.token, now)).not.toBeNull();

			await changePassword(
				db,
				{
					userId: reg.value.userId,
					sessionId: sessionB.sessionId,
					currentPassword: 'updatedpass123',
					newPassword: 'anotherpass123'
				},
				now,
				'test-corr-3'
			);
			expect(await findActiveSession(db, sessionC.token, now)).toBeNull();
			expect(await findActiveSession(db, sessionB.token, now)).not.toBeNull();
		});
	});

	it('TC-ACC-03a: rolling expiry keeps an active session valid', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const email = `persist-${Date.now()}@example.com`;
			const reg = await registerSeeker(
				db,
				{
					email,
					password: 'password123',
					displayName: 'Persist User',
					acceptedTerms: true
				},
				now,
				'test-corr'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.userId) return;

			const session = await createSession(db, {
				userId: reg.value.userId,
				ipAddress: '127.0.0.1',
				userAgent: 'browser',
				now
			});

			const later = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
			expect(await findActiveSession(db, session.token, later)).not.toBeNull();
		});
	});

	it('hashes session tokens deterministically for lookup', () => {
		expect(hashSessionToken('abc')).toBe(hashSessionToken('abc'));
	});
});
