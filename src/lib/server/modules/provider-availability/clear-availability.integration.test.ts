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
import {
	clearAvailabilityForOwner,
	getAvailabilityStatusForOwner,
	setAvailabilityForOwner
} from '../provider-availability';
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
			displayName: `Clear ${label}`,
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

describe('US-AVAIL-02 one tap im done', () => {
	it('TC-AVAIL-02a: clear removes live status from owner, public profile, and discovery', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail02a');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Availability clear integration intro.'
			);

			const setAt = new Date('2026-09-05T12:00:00Z');
			const set = await setAvailabilityForOwner(db, ownerId, 'corr-avail-set', setAt);
			expect(set.ok).toBe(true);

			const clearedAt = new Date('2026-09-05T12:05:00Z');
			const cleared = await clearAvailabilityForOwner(db, ownerId, 'corr-avail-clear', clearedAt);
			expect(cleared.ok).toBe(true);
			if (!cleared.ok) throw new Error('clear failed');
			expect(cleared.value.state).toBe('not_available');
			expect(cleared.value.setAt).toBeNull();
			expect(cleared.value.expiresAt).toBeNull();

			const ownerStatus = await getAvailabilityStatusForOwner(db, ownerId, clearedAt);
			expect(ownerStatus.ok).toBe(true);
			if (!ownerStatus.ok) throw new Error('status read failed');
			expect(ownerStatus.value.state).toBe('not_available');

			const publicProfile = await getPublicProfile(
				db,
				profile.profileId,
				anonymousAuth('127.0.0.1')
			);
			expect(publicProfile.ok).toBe(true);
			if (!publicProfile.ok) throw new Error('public profile failed');
			expect(publicProfile.value.availability?.state).toBe('not_available');
			expect(publicProfile.value.onlineStatus).not.toBe('online');

			const projectionRows = await db.execute<{
				availability_state: string;
				availability_set_at: string | null;
			}>(sql`
				select availability_state, availability_set_at
				from discovery_search.search_projection
				where provider_profile_id = ${profile.profileId}::uuid
			`);
			const projection = (
				projectionRows as unknown as Array<{
					availability_state: string;
					availability_set_at: string | null;
				}>
			)[0];
			expect(projection?.availability_state).toBe('not_available');
			expect(projection?.availability_set_at).toBeNull();

			const search = await runSearch(
				db,
				{ q: 'Availability clear', lexicon: [], limit: 20 },
				anonymousAuth('127.0.0.1')
			);
			const card = search.cards.find((c) => c.providerProfileId === profile.profileId);
			expect(card?.availability.state).toBe('not_available');

			const availableNowSearch = await runSearch(
				db,
				{ q: 'Availability clear', lexicon: [], limit: 20, available: true },
				anonymousAuth('127.0.0.1')
			);
			expect(
				availableNowSearch.cards.find((c) => c.providerProfileId === profile.profileId)
			).toBeUndefined();

			const historyRows = await db.execute<{ event_type: string }>(sql`
				select event_type
				from provider_availability.availability_history
				where provider_profile_id = ${profile.profileId}::uuid
				order by occurred_at
			`);
			const events = (historyRows as unknown as Array<{ event_type: string }>).map(
				(row) => row.event_type
			);
			expect(events).toEqual(['set', 'cleared']);
		});
	});

	it('allows only one concurrent clear to emit AvailabilityCleared', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail02-conc');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Concurrent clear probe intro.'
			);
			const setAt = new Date('2026-09-05T12:00:00Z');
			expect((await setAvailabilityForOwner(db, ownerId, 'corr-set-conc', setAt)).ok).toBe(true);

			const clearedAt = new Date('2026-09-05T12:05:00Z');
			await Promise.all([
				clearAvailabilityForOwner(db, ownerId, 'corr-clear-conc-1', clearedAt),
				clearAvailabilityForOwner(db, ownerId, 'corr-clear-conc-2', clearedAt)
			]);

			const events = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from shared.outbox
				where event_name = 'AvailabilityCleared'
				  and payload->>'providerProfileId' = ${profile.profileId}
			`);
			expect((events as unknown as Array<{ count: number }>)[0]?.count).toBe(1);

			const historyRows = await db.execute<{ count: number }>(sql`
				select count(*)::int as count
				from provider_availability.availability_history
				where provider_profile_id = ${profile.profileId}::uuid
				  and event_type = 'cleared'
			`);
			expect((historyRows as unknown as Array<{ count: number }>)[0]?.count).toBe(1);
		});
	});

	it('TC-AVAIL-02a: clear from expiry_warned is idempotent and clears live state', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail02b');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Expiry warned clear intro.'
			);

			const warnedAt = new Date('2026-09-05T13:45:00Z');
			const setAt = new Date('2026-09-05T10:00:00Z');
			const expiresAt = new Date('2026-09-05T14:00:00Z');
			await db.execute(sql`
				insert into provider_availability.availability_status (
					provider_profile_id, state, set_at, expires_at, warned_at, updated_at
				) values (
					${profile.profileId}::uuid,
					'expiry_warned',
					${setAt.toISOString()}::timestamptz,
					${expiresAt.toISOString()}::timestamptz,
					${warnedAt.toISOString()}::timestamptz,
					${warnedAt.toISOString()}::timestamptz
				)
			`);

			const cleared = await clearAvailabilityForOwner(
				db,
				ownerId,
				'corr-warned-clear',
				new Date('2026-09-05T13:50:00Z')
			);
			expect(cleared.ok).toBe(true);
			if (!cleared.ok) throw new Error('clear failed');
			expect(cleared.value.state).toBe('not_available');

			const noop = await clearAvailabilityForOwner(
				db,
				ownerId,
				'corr-clear-noop',
				new Date('2026-09-05T13:51:00Z')
			);
			expect(noop.ok).toBe(true);
			if (!noop.ok) throw new Error('noop clear failed');
			expect(noop.value.state).toBe('not_available');
		});
	});
});
