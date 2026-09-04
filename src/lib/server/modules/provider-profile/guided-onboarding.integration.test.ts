import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import {
	attachOnboardingPhoto,
	createDraftProfile,
	loadOwnerProfile,
	setLanguages,
	setServiceTags,
	listActiveServiceTags,
	updateIntro
} from '../provider-profile';
import type { AreaId, UserId } from '../../shared/ids';

describe('US-PONB-02 guided onboarding integration', () => {
	it('resumes at the first incomplete step after partial progress', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const now = new Date();
			const reg = await registerProvider(
				db,
				{
					email: `onboarding-resume-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Resume Test',
					phone: `+2784${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-02a'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.otpId || !reg.value.userId) return;

			const code = getDevOtpCode(reg.value.otpId);
			const verified = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: code! },
				now,
				'test-corr-ponb-02b'
			);
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;

			const ownerId = verified.value.userId as UserId;
			await createDraftProfile(db, ownerId, areaId);
			await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
			await updateIntro(
				db,
				ownerId,
				'Licensed therapist focused on sports recovery.',
				crypto.randomUUID(),
				now
			);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.onboarding.currentStep).toBe('services');
			expect(profile?.onboarding.steps.find((s) => s.step === 'photos')?.complete).toBe(true);
			expect(profile?.onboarding.steps.find((s) => s.step === 'intro')?.complete).toBe(true);
		});
	});

	it('publish readiness lists missing minimum fields after photos and intro only', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const now = new Date();
			const reg = await registerProvider(
				db,
				{
					email: `onboarding-readiness-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Readiness Test',
					phone: `+2785${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-02c'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.otpId || !reg.value.userId) return;

			const code = getDevOtpCode(reg.value.otpId);
			const verified = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: code! },
				now,
				'test-corr-ponb-02d'
			);
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;

			const ownerId = verified.value.userId as UserId;
			await createDraftProfile(db, ownerId, areaId);
			await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
			await updateIntro(db, ownerId, 'Short intro.', crypto.randomUUID(), now);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.readiness.ready).toBe(false);
			expect(profile?.readiness.missing).toContain('priced_service');
			expect(profile?.readiness.missing).toContain('language');
		});
	});

	it('deduplicates duplicate language codes on save', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const now = new Date();
			const reg = await registerProvider(
				db,
				{
					email: `onboarding-lang-dedupe-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Lang Dedupe',
					phone: `+2787${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-02e'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.otpId) return;

			const verified = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: getDevOtpCode(reg.value.otpId)! },
				now,
				'test-corr-ponb-02f'
			);
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;

			const ownerId = verified.value.userId as UserId;
			await createDraftProfile(db, ownerId, areaId);

			const saved = await setLanguages(db, ownerId, ['en', 'en'], crypto.randomUUID(), now);
			expect(saved.ok).toBe(true);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.languageCodes).toEqual(['en']);
		});
	});

	it('clears service tags when an empty selection is saved', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const now = new Date();
			const reg = await registerProvider(
				db,
				{
					email: `onboarding-tags-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Tag Clear',
					phone: `+2788${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-02g'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.otpId) return;

			const verified = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: getDevOtpCode(reg.value.otpId)! },
				now,
				'test-corr-ponb-02h'
			);
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;

			const ownerId = verified.value.userId as UserId;
			await createDraftProfile(db, ownerId, areaId);
			const tags = await listActiveServiceTags(db);
			expect(tags.length).toBeGreaterThan(0);

			await setServiceTags(db, ownerId, [tags[0]!.id], crypto.randomUUID(), now);
			const cleared = await setServiceTags(db, ownerId, [], crypto.randomUUID(), now);
			expect(cleared.ok).toBe(true);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.selectedTagIds).toEqual([]);
		});
	});

	it('enforces the gallery photo cap under concurrent attach', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const now = new Date();
			const reg = await registerProvider(
				db,
				{
					email: `onboarding-photos-${Date.now()}@example.com`,
					password: 'password123',
					displayName: 'Photo Cap',
					phone: `+2789${String(Date.now()).slice(-7)}`,
					acceptedTerms: true
				},
				now,
				'test-corr-ponb-02i'
			);
			expect(reg.ok).toBe(true);
			if (!reg.ok || !reg.value.otpId) return;

			const verified = await verifyOtp(
				db,
				{ otpId: reg.value.otpId, code: getDevOtpCode(reg.value.otpId)! },
				now,
				'test-corr-ponb-02j'
			);
			expect(verified.ok).toBe(true);
			if (!verified.ok) return;

			const ownerId = verified.value.userId as UserId;
			await createDraftProfile(db, ownerId, areaId);

			for (let i = 0; i < 11; i++) {
				const attached = await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
				expect(attached.ok).toBe(true);
			}

			const concurrent = await Promise.all(
				Array.from({ length: 3 }, () =>
					attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now)
				)
			);
			const successes = concurrent.filter((result) => result.ok).length;
			expect(successes).toBeLessThanOrEqual(1);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.photos.length).toBeLessThanOrEqual(12);
		});
	});
});
