import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { users } from './infra/schema';
import { hashPassword } from './infra/password-hash';
import {
	ADMIN_IDLE_MS,
	completeAdminLogin,
	findActiveSession,
	generateTotpCode,
	hasAdminTotpEnrollment,
	maybeTouchSession,
	verifyAdminPassword
} from './index';
import { beginAdminTotpEnrollment } from './infra/admin-totp-commands';
import { createAdminSession } from './infra/session-commands';
import { asId } from '../../shared/ids';

const ADMIN_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000097');

describe('US-ADMIN-01 admin console hardening integration', () => {
	async function seedAdmin(db: Parameters<Parameters<typeof withTestDatabase>[0]>[0]) {
		await seedPlatform(db);
		await loadConfigCache(db);
		const passwordHash = await hashPassword('adminpass123');
		await db.insert(users).values({
			id: ADMIN_ID,
			displayName: 'Platform Admin',
			email: 'admin@example.com',
			emailVerifiedAt: new Date(),
			passwordHash,
			isAdmin: true,
			status: 'active'
		});
	}

	it('TC-ADMIN-01a: login is blocked until TOTP is enrolled', async () => {
		await withTestDatabase(async (db) => {
			await seedAdmin(db);
			const now = new Date();

			const password = await verifyAdminPassword(db, {
				email: 'admin@example.com',
				password: 'adminpass123'
			});
			expect(password.ok).toBe(true);
			if (!password.ok || !password.value.needsEnrollment || !password.value.enrollment) return;

			const blocked = await completeAdminLogin(db, {
				userId: password.value.userId,
				code: '000000',
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});
			expect(blocked.ok).toBe(false);

			expect(await hasAdminTotpEnrollment(db, password.value.userId)).toBe(false);
		});
	});

	it('TC-ADMIN-01a: enrollment completes and creates an admin session', async () => {
		await withTestDatabase(async (db) => {
			await seedAdmin(db);
			const now = new Date();

			const password = await verifyAdminPassword(db, {
				email: 'admin@example.com',
				password: 'adminpass123'
			});
			expect(password.ok).toBe(true);
			if (!password.ok || !password.value.enrollment) return;

			const code = generateTotpCode(password.value.enrollment.secret, now);
			const login = await completeAdminLogin(db, {
				userId: password.value.userId,
				code,
				enrollment: {
					secret: password.value.enrollment.secret,
					backupCodes: password.value.enrollment.backupCodes
				},
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});
			expect(login.ok).toBe(true);
			if (!login.ok) return;
			expect(await hasAdminTotpEnrollment(db, password.value.userId)).toBe(true);
			expect(await findActiveSession(db, login.value.token, now)).not.toBeNull();
		});
	});

	it('TC-ADMIN-01b: admin session expires after twelve hours idle', async () => {
		await withTestDatabase(async (db) => {
			await seedAdmin(db);
			const now = new Date();
			const started = beginAdminTotpEnrollment('admin@example.com');
			const code = generateTotpCode(started.secret, now);
			const login = await completeAdminLogin(db, {
				userId: ADMIN_ID,
				code,
				enrollment: {
					secret: started.secret,
					backupCodes: started.result.backupCodes
				},
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const expiredAt = new Date(now.getTime() + ADMIN_IDLE_MS + 1);
			expect(await findActiveSession(db, login.value.token, expiredAt)).toBeNull();
		});
	});

	it('createAdminSession uses a twelve-hour expiry cap', async () => {
		await withTestDatabase(async (db) => {
			await seedAdmin(db);
			const now = new Date();
			const session = await createAdminSession(db, {
				userId: ADMIN_ID,
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now
			});
			const active = await findActiveSession(db, session.token, now);
			expect(active).not.toBeNull();
			if (!active) return;
			expect(active.expiresAt.getTime() - now.getTime()).toBeLessThanOrEqual(ADMIN_IDLE_MS);
		});
	});

	it('active admin sessions extend idle deadline on touch', async () => {
		await withTestDatabase(async (db) => {
			await seedAdmin(db);
			const loginAt = new Date('2026-09-06T08:00:00.000Z');
			const started = beginAdminTotpEnrollment('admin@example.com');
			const code = generateTotpCode(started.secret, loginAt);
			const login = await completeAdminLogin(db, {
				userId: ADMIN_ID,
				code,
				enrollment: {
					secret: started.secret,
					backupCodes: started.result.backupCodes
				},
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now: loginAt
			});
			expect(login.ok).toBe(true);
			if (!login.ok) return;

			const touchAt = new Date(loginAt.getTime() + (11 * ADMIN_IDLE_MS) / 12);
			const activeBeforeTouch = await findActiveSession(db, login.value.token, touchAt);
			expect(activeBeforeTouch).not.toBeNull();
			if (!activeBeforeTouch) return;

			await maybeTouchSession(db, activeBeforeTouch, touchAt);

			const stillActiveAt = new Date(touchAt.getTime() + (11 * ADMIN_IDLE_MS) / 12);
			expect(await findActiveSession(db, login.value.token, stillActiveAt)).not.toBeNull();
		});
	});
});
