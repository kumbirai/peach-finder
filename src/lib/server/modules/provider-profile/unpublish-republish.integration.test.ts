import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { withTestDatabase } from '../../db/test-harness';
import { seedCore } from '../../../../../scripts/seed-core';
import { seedPlatform, loadConfigCache, listAreas } from '../platform-configuration';
import { registerProvider, verifyOtp } from '../identity-and-access/infra/otp-commands';
import { getDevOtpCode } from '../identity-and-access/infra/dev-verification';
import { runSearch } from '../discovery-search';
import { anonymousAuth } from '../../shared/auth-context';
import type { AreaId, UserId } from '../../shared/ids';
import {
	addService,
	attachOnboardingPhoto,
	createDraftProfile,
	getPublicProfile,
	loadOwnerProfile,
	publishProfileForOwner,
	setLanguages,
	unpublishProfileForOwnerDb,
	updateArea,
	updateIntro
} from '../provider-profile';

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
			displayName: 'Unpublish Test',
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

async function publishMinimalProfile(
	db: Parameters<typeof registerVerifiedProvider>[0],
	ownerId: UserId,
	areaId: AreaId,
	intro: string
) {
	const now = new Date();
	await createDraftProfile(db, ownerId, areaId);
	await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
	await updateIntro(db, ownerId, intro, crypto.randomUUID(), now);
	await addService(
		db,
		ownerId,
		{ name: 'Swedish', durationMinutes: 60, priceCents: 50000 },
		crypto.randomUUID(),
		now
	);
	await setLanguages(db, ownerId, ['en'], crypto.randomUUID(), now);
	await updateArea(db, ownerId, areaId, crypto.randomUUID(), now);
	const published = await publishProfileForOwner(db, ownerId, 'corr-publish', now);
	expect(published.ok).toBe(true);
	const profile = await loadOwnerProfile(db, ownerId);
	if (!profile) throw new Error('missing profile');
	return profile;
}

describe('US-PONB-06 unpublish and republish integration', () => {
	it('TC-PONB-06a: unpublish/republish round-trip is lossless and discoverable again', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-06a');
			const intro = 'Holiday break specialist — back soon.';
			const profile = await publishMinimalProfile(db, ownerId, areaId, intro);
			const profileId = profile.profileId;
			const trialStartedAt = profile.listing?.trialStartedAt;

			const viewer = anonymousAuth('127.0.0.1');
			const beforeSearch = await runSearch(
				db,
				{ q: 'holiday break', lexicon: [], limit: 20 },
				viewer
			);
			expect(beforeSearch.cards.some((card) => card.providerProfileId === profileId)).toBe(true);

			const unpublishAt = new Date('2026-09-10T10:00:00Z');
			const unpublishedId = await unpublishProfileForOwnerDb(
				db,
				ownerId,
				'owner',
				'corr-ponb-06a-unpublish',
				unpublishAt
			);
			expect(unpublishedId).toBe(profileId);

			const hidden = await loadOwnerProfile(db, ownerId);
			expect(hidden?.publishState).toBe('unpublished');
			expect(hidden?.intro).toBe(intro);
			expect(hidden?.photos.length).toBe(1);
			expect(hidden?.services.length).toBe(1);
			expect(hidden?.languageCodes).toEqual(['en']);
			expect(hidden?.listing?.trialStartedAt).toBe(trialStartedAt);

			const projectionRows = await db.execute<{ count: number }>(sql`
				select count(*)::int as count from discovery_search.search_projection
				where provider_profile_id = ${profileId}::uuid
			`);
			expect((projectionRows as unknown as Array<{ count: number }>)[0]?.count).toBe(0);

			const publicWhileHidden = await getPublicProfile(db, profileId, viewer);
			expect(publicWhileHidden.ok).toBe(false);

			const unpublishedEvents = await db.execute<{ reason: string }>(sql`
				select payload->>'reason' as reason
				from shared.outbox
				where event_name = 'ProviderUnpublished'
				  and payload->>'providerProfileId' = ${profileId}
			`);
			expect((unpublishedEvents as unknown as Array<{ reason: string }>)[0]?.reason).toBe('owner');

			const republishAt = new Date('2026-09-15T14:00:00Z');
			const republished = await publishProfileForOwner(
				db,
				ownerId,
				'corr-ponb-06a-republish',
				republishAt
			);
			expect(republished.ok).toBe(true);
			if (!republished.ok) return;
			expect(republished.value.alreadyPublished).toBe(false);

			const liveAgain = await loadOwnerProfile(db, ownerId);
			expect(liveAgain?.publishState).toBe('published');
			expect(liveAgain?.intro).toBe(intro);
			expect(liveAgain?.photos.length).toBe(1);
			expect(liveAgain?.listing?.trialStartedAt).toBe(trialStartedAt);

			const publicAfter = await getPublicProfile(db, profileId, viewer);
			expect(publicAfter.ok).toBe(true);

			const afterSearch = await runSearch(
				db,
				{ q: 'holiday break', lexicon: [], limit: 20 },
				viewer
			);
			expect(afterSearch.cards.some((card) => card.providerProfileId === profileId)).toBe(true);

			const publishedEvents = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'ProviderPublished'
				  and payload->>'providerProfileId' = ${profileId}
			`);
			expect((publishedEvents as unknown as Array<{ count: number }>)[0]?.count).toBe(2);

			const trialEvents = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'TrialStarted'
				  and payload->>'providerProfileId' = ${profileId}
			`);
			expect((trialEvents as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});

	it('allows only one concurrent unpublish to emit ProviderUnpublished', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-06c');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Concurrent unpublish probe.'
			);
			const now = new Date();

			await Promise.all([
				unpublishProfileForOwnerDb(db, ownerId, 'owner', 'corr-conc-1', now),
				unpublishProfileForOwnerDb(db, ownerId, 'owner', 'corr-conc-2', now)
			]);

			const events = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'ProviderUnpublished'
				  and payload->>'providerProfileId' = ${profile.profileId}
			`);
			expect((events as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});

	it('unpublish on draft is a no-op without emitting ProviderUnpublished', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-06d');
			await createDraftProfile(db, ownerId, areaId);
			const profile = await loadOwnerProfile(db, ownerId);
			if (!profile) throw new Error('missing profile');

			await unpublishProfileForOwnerDb(db, ownerId, 'owner', 'corr-draft-unpub', new Date());

			const after = await loadOwnerProfile(db, ownerId);
			expect(after?.publishState).toBe('draft');

			const events = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'ProviderUnpublished'
				  and payload->>'providerProfileId' = ${profile.profileId}
			`);
			expect((events as unknown as Array<{ count: number }>)[0]?.count).toBe(0);
		});
	});

	it('unpublish is idempotent when already unpublished', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'ponb-06b');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Idempotent unpublish test.'
			);
			const now = new Date();

			await unpublishProfileForOwnerDb(db, ownerId, 'owner', 'corr-1', now);
			await unpublishProfileForOwnerDb(db, ownerId, 'owner', 'corr-2', now);

			const events = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'ProviderUnpublished'
				  and payload->>'providerProfileId' = ${profile.profileId}
			`);
			expect((events as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});
});
