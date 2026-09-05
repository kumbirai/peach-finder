import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { runSearch } from '../discovery-search';
import { getPublicProfile } from '../provider-profile';
import {
	addService,
	attachOnboardingPhoto,
	createDraftProfile,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
	updateArea,
	updateIntro
} from '../provider-profile';
import type { AreaId, UserId } from '../../shared/ids';
import { anonymousAuth } from '../../shared/auth-context';

async function registerVerifiedProvider(
	db: Parameters<typeof withTestDatabase>[0] extends (db: infer D) => unknown ? D : never,
	areaId: AreaId,
	label: string
): Promise<UserId> {
	const now = new Date();
	const reg = await registerProvider(
		db,
		{
			email: `${label}-${Date.now()}@example.com`,
			password: 'password123',
			displayName: 'Publish Test',
			phone: `+2786${String(Date.now()).slice(-7)}`,
			acceptedTerms: true
		},
		now,
		`corr-${label}`
	);
	expect(reg.ok).toBe(true);
	if (!reg.ok || !reg.value.otpId) throw new Error('registration failed');

	const verified = await verifyOtp(
		db,
		{ otpId: reg.value.otpId, code: getDevOtpCode(reg.value.otpId)! },
		now,
		`corr-${label}-verify`
	);
	expect(verified.ok).toBe(true);
	if (!verified.ok) throw new Error('verify failed');
	return verified.value.userId as UserId;
}

describe('US-PONB-04 publish profile integration', () => {
	it('TC-PONB-04a: publish with minimum fields is instant and discoverable', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-04a');
			const registrationAt = new Date('2026-09-01T10:00:00Z');
			const publishAt = new Date('2026-09-05T14:00:00Z');

			await createDraftProfile(db, ownerId, areaId);
			await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), publishAt);
			await updateIntro(
				db,
				ownerId,
				'Licensed therapist focused on sports recovery.',
				crypto.randomUUID(),
				publishAt
			);
			await addService(
				db,
				ownerId,
				{ name: 'Deep tissue', durationMinutes: 60, priceCents: 45000 },
				crypto.randomUUID(),
				publishAt
			);
			await setLanguages(db, ownerId, ['en'], crypto.randomUUID(), publishAt);
			await updateArea(db, ownerId, areaId, crypto.randomUUID(), publishAt);

			const before = await loadOwnerProfile(db, ownerId);
			expect(before?.readiness.ready).toBe(true);
			expect(before?.publishState).toBe('draft');
			expect(before?.listing?.state).toBe('building');
			expect(before?.listing?.trialStartedAt).toBeNull();

			const published = await publishProfileForOwner(
				db,
				ownerId,
				'corr-ponb-04a-publish',
				publishAt
			);
			expect(published.ok).toBe(true);

			const after = await loadOwnerProfile(db, ownerId);
			expect(after?.publishState).toBe('published');
			expect(after?.listing?.state).toBe('free_listed');
			expect(after?.listing?.trialStartedAt).toBe(publishAt.toISOString());
			expect(after?.listing?.trialStartedAt).not.toBe(registrationAt.toISOString());

			const listingRows = await db.execute<{ trial_started_at: string }>(sql`
				select trial_started_at from listing_billing.listing
				where provider_profile_id = ${after!.profileId}::uuid
			`);
			const trialStartedRaw = (listingRows as unknown as Array<{ trial_started_at: string }>)[0]
				?.trial_started_at;
			expect(new Date(trialStartedRaw!).toISOString()).toBe(publishAt.toISOString());

			const projectionRows = await db.execute<{ count: number }>(sql`
				select count(*)::int as count from discovery_search.search_projection
				where provider_profile_id = ${after!.profileId}::uuid
			`);
			expect((projectionRows as unknown as Array<{ count: number }>)[0]?.count).toBe(1);

			const viewer = anonymousAuth('127.0.0.1');
			const publicView = await getPublicProfile(db, after!.profileId, viewer);
			expect(publicView.ok).toBe(true);

			const search = await runSearch(db, { q: 'sports recovery', lexicon: [], limit: 20 }, viewer);
			expect(search.cards.some((card) => card.providerProfileId === after!.profileId)).toBe(true);
		});
	});

	it('TC-PONB-04a: incomplete profile returns validation errors', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-04b');
			await createDraftProfile(db, ownerId, areaId);

			const result = await publishProfileForOwner(db, ownerId, 'corr-ponb-04b-publish', new Date());
			expect(result.ok).toBe(false);
			if (result.ok || result.error.kind !== 'validation_failed') return;
			expect(result.error.issues.length).toBeGreaterThan(0);
		});
	});

	it('allows only one concurrent publish to emit lifecycle events', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-04d');
			const now = new Date();
			await createDraftProfile(db, ownerId, areaId);
			await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
			await updateIntro(db, ownerId, 'Ready to publish.', crypto.randomUUID(), now);
			await addService(
				db,
				ownerId,
				{ name: 'Swedish', durationMinutes: 60, priceCents: 50000 },
				crypto.randomUUID(),
				now
			);
			await setLanguages(db, ownerId, ['en'], crypto.randomUUID(), now);
			await updateArea(db, ownerId, areaId, crypto.randomUUID(), now);

			const profile = await loadOwnerProfile(db, ownerId);
			expect(profile?.readiness.ready).toBe(true);

			const results = await Promise.all([
				publishProfileForOwner(db, ownerId, 'corr-ponb-04d-1', now),
				publishProfileForOwner(db, ownerId, 'corr-ponb-04d-2', now)
			]);

			expect(results.every((result) => result.ok)).toBe(true);
			const freshPublishes = results.filter(
				(result) => result.ok && !result.value.alreadyPublished
			);
			const idempotent = results.filter((result) => result.ok && result.value.alreadyPublished);
			expect(freshPublishes).toHaveLength(1);
			expect(idempotent).toHaveLength(1);

			const publishedEvents = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'ProviderPublished'
				  and payload->>'providerProfileId' = ${profile!.profileId}
			`);
			expect((publishedEvents as unknown as Array<{ count: number }>)[0]?.count).toBe(1);

			const trialEvents = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'TrialStarted'
				  and payload->>'providerProfileId' = ${profile!.profileId}
			`);
			expect((trialEvents as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});

	it('republish while already published is idempotent', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-04c');
			const now = new Date();
			await createDraftProfile(db, ownerId, areaId);
			await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
			await updateIntro(db, ownerId, 'Ready to publish.', crypto.randomUUID(), now);
			await addService(
				db,
				ownerId,
				{ name: 'Swedish', durationMinutes: 60, priceCents: 50000 },
				crypto.randomUUID(),
				now
			);
			await setLanguages(db, ownerId, ['en'], crypto.randomUUID(), now);
			await updateArea(db, ownerId, areaId, crypto.randomUUID(), now);

			const first = await publishProfileForOwner(db, ownerId, 'corr-ponb-04c-1', now);
			const second = await publishProfileForOwner(db, ownerId, 'corr-ponb-04c-2', now);
			expect(first.ok).toBe(true);
			expect(second.ok).toBe(true);
			if (!second.ok) return;
			expect(second.value.alreadyPublished).toBe(true);
		});
	});
});
