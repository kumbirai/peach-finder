import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from './infra/otp-commands';
import { getDevOtpCode } from './infra/dev-verification';
import { requireActiveRegistrationArea } from './app/provider-registration-area';
import { createDraftProfile, ownsProfileDb } from '../provider-profile';
import type { AreaId } from '../../shared/ids';
import { phoneOtps } from './infra/schema';

describe('US-PONB-01 provider registration integration', () => {
	it('TC-PONB-01a: registration + OTP verify creates draft profile', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const now = new Date();
			const phone = `+2782${String(Date.now()).slice(-7)}`;
			const reg = await registerProvider(
				db,
				{
					email: `provider-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Sipho M.',
					phone,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-01a'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.userId || !reg.value.otpId) return;

			const code = getDevOtpCode(reg.value.otpId);
			expect(code).toMatch(/^\d{6}$/);

			const verified = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: code! },
				now,
				'test-corr-ponb-01b'
			);
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;

			const draft = await createDraftProfile(db, verified.value.userId, areaId);
			expect(draft.ok).toBe(true);
			expect(await ownsProfileDb(db, verified.value.userId)).toBe(true);
		});
	});

	it('TC-PONB-01b: sixth wrong OTP attempt is rejected', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);

			const now = new Date();
			const phone = `+2783${String(Date.now()).slice(-7)}`;
			const reg = await registerProvider(
				db,
				{
					email: `otp-limit-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'OTP Tester',
					phone,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-01b-reg'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.otpId) return;

			for (let i = 0; i < 5; i++) {
				const attempt = await verifyOtp(
					db,
					{ otpId: reg.value.otpId, code: '000000' },
					now,
					`test-corr-ponb-01b-${i}`
				);
				expect(attempt.ok).toBe(false);
			}

			const sixth = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: '000000' },
				now,
				'test-corr-ponb-01b-6'
			);
			expect(sixth.ok).toBe(false);
			if (sixth.ok) return;
			expect(sixth.error.kind).toBe('precondition_failed');

			const code = getDevOtpCode(reg.value.otpId);
			const fresh = await registerProvider(
				db,
				{
					email: `otp-fresh-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Fresh OTP',
					phone: `+2784${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-01b-fresh'
			);
			expect(fresh.ok).toBe(true);
			if (!fresh.ok || !fresh.value.otpId) return;
			const freshCode = getDevOtpCode(fresh.value.otpId);
			const ok = await verifyOtp(
				db,
				{ otpId: fresh.value.otpId, code: freshCode! },
				now,
				'test-corr-ponb-01b-fresh-verify'
			);
			expect(ok.ok).toBe(true);
			void code;
		});
	});

	it('TC-PONB-01: invalid area is rejected before profile creation', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			const areaCheck = await requireActiveRegistrationArea(
				db,
				'00000000-0000-7000-8000-000000000099'
			);
			expect(areaCheck.ok).toBe(false);
			if (!areaCheck.ok && areaCheck.error.kind === 'validation_failed') {
				expect(areaCheck.error.issues[0]?.path).toBe('areaId');
			}
		});
	});

	it('TC-PONB-01b: attempt_count increments on wrong code', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			const now = new Date();
			const reg = await registerProvider(
				db,
				{
					email: `otp-count-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Count Tester',
					phone: `+2785${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-count'
			);
			if (!reg.ok || !reg.value.otpId) return;
			await verifyOtp(db, { otpId: reg.value.otpId, code: '111111' }, now, 'c1');
			const rows = await db
				.select({ attemptCount: phoneOtps.attemptCount })
				.from(phoneOtps)
				.where(eq(phoneOtps.id, reg.value.otpId))
				.limit(1);
			expect(rows[0]?.attemptCount).toBe(1);
		});
	});
});
