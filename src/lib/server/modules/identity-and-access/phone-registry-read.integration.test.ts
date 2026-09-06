import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform } from '../platform-configuration';
import { registerProvider, verifyOtp, getPhoneVerifiedAt, wasPhoneUsedBefore } from './index';
import { getDevOtpCode } from './infra/dev-verification';
import { hashPhone } from './infra/phone-hash';
import { deleteAccount } from './infra/account-deletion';
import { createSession } from './infra/session-commands';
import type { UserId } from '../../shared/ids';

describe('phone registry read facade', () => {
	it('detects reuse only after a prior account verified the same number', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);

			const phone = `+2787${String(Date.now()).slice(-7)}`;
			const firstVerifyAt = new Date('2026-09-01T10:00:00.000Z');
			const secondVerifyAt = new Date('2026-09-10T10:00:00.000Z');

			const firstReg = await registerProvider(
				db,
				{
					email: `phone-read-1-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'First',
					phone,
					acceptedTerms: true
				},
				firstVerifyAt,
				'corr-phone-read-1'
			);
			expect(firstReg.ok).toBe(true);
			if (!firstReg.ok || !firstReg.value.otpId) return;

			const firstVerified = await verifyOtp(
				db,
				{ otpId: firstReg.value.otpId, code: getDevOtpCode(firstReg.value.otpId)! },
				firstVerifyAt,
				'corr-phone-read-1-verify'
			);
			expect(firstVerified.ok).toBe(true);
			if (!firstVerified.ok) return;

			const firstUserId = firstVerified.value.userId as UserId;
			const phoneHash = hashPhone(phone);
			const firstVerifiedAt = await getPhoneVerifiedAt(db, firstUserId);
			expect(firstVerifiedAt).not.toBeNull();
			expect(await wasPhoneUsedBefore(db, phoneHash, firstVerifiedAt!)).toBe(false);

			const { sessionId } = await createSession(db, {
				userId: firstUserId,
				ipAddress: '127.0.0.1',
				userAgent: 'test',
				now: secondVerifyAt
			});
			await deleteAccount(
				db,
				{ userId: firstUserId, sessionId, password: 'password123', confirm: true },
				secondVerifyAt,
				'corr-phone-read-delete'
			);

			const secondReg = await registerProvider(
				db,
				{
					email: `phone-read-2-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Second',
					phone,
					acceptedTerms: true
				},
				secondVerifyAt,
				'corr-phone-read-2'
			);
			expect(secondReg.ok).toBe(true);
			if (!secondReg.ok || !secondReg.value.otpId) return;

			const secondVerified = await verifyOtp(
				db,
				{ otpId: secondReg.value.otpId, code: getDevOtpCode(secondReg.value.otpId)! },
				secondVerifyAt,
				'corr-phone-read-2-verify'
			);
			expect(secondVerified.ok).toBe(true);
			if (!secondVerified.ok) return;

			const secondVerifiedAt = await getPhoneVerifiedAt(db, secondVerified.value.userId as UserId);
			expect(secondVerifiedAt).not.toBeNull();
			expect(await wasPhoneUsedBefore(db, phoneHash, secondVerifiedAt!)).toBe(true);
		});
	});
});
