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
import { getAvailabilityStatusForOwner, setAvailabilityForOwner } from '../provider-availability';
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
			displayName: `Avail ${label}`,
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

describe('US-AVAIL-01 one tap available', () => {
	it('TC-AVAIL-01a: set records timestamp and live status for owner', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail01a');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Availability one tap integration intro.'
			);

			const setAt = new Date('2026-09-05T12:00:00Z');
			const set = await setAvailabilityForOwner(db, ownerId, 'corr-avail-set', setAt);
			expect(set.ok).toBe(true);
			if (!set.ok) throw new Error('set failed');

			expect(set.value.state).toBe('available');
			expect(set.value.setAt).toBe(setAt.toISOString());
			expect(set.value.expiresAt).toBeTruthy();

			const ownerStatus = await getAvailabilityStatusForOwner(db, ownerId, setAt);
			expect(ownerStatus.ok).toBe(true);
			if (!ownerStatus.ok) throw new Error('status read failed');
			expect(ownerStatus.value.state).toBe('available');

			const publicProfile = await getPublicProfile(
				db,
				profile.profileId,
				anonymousAuth('127.0.0.1')
			);
			expect(publicProfile.ok).toBe(true);
			if (!publicProfile.ok) throw new Error('public profile failed');
			expect(publicProfile.value.availability?.state).toBe('available');
		});
	});

	it('TC-AVAIL-01b: discovery projection reflects availability immediately', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail01b');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Discovery availability mirror intro.'
			);

			const setAt = new Date('2026-09-05T15:30:00Z');
			const set = await setAvailabilityForOwner(db, ownerId, 'corr-avail-disc', setAt);
			expect(set.ok).toBe(true);

			const projectionRows = await db.execute<{
				availability_state: string;
				availability_set_at: string;
			}>(sql`
				select availability_state, availability_set_at
				from discovery_search.search_projection
				where provider_profile_id = ${profile.profileId}::uuid
			`);
			const projection = (
				projectionRows as unknown as Array<{
					availability_state: string;
					availability_set_at: string;
				}>
			)[0];
			expect(projection?.availability_state).toBe('available');
			expect(new Date(projection!.availability_set_at).toISOString()).toBe(setAt.toISOString());

			const search = await runSearch(
				db,
				{ q: 'Discovery availability', lexicon: [], limit: 20 },
				anonymousAuth('127.0.0.1')
			);
			const card = search.cards.find((c) => c.providerProfileId === profile.profileId);
			expect(card?.availability.state).toBe('available');
		});
	});

	it('TC-AVAIL-01c: re-set refreshes timestamp and moves provider up recency ordering', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerA = await registerVerifiedProvider(db, areaId, 'avail01c-a');
			const ownerB = await registerVerifiedProvider(db, areaId, 'avail01c-b');
			const profileA = await publishMinimalProfile(
				db,
				ownerA,
				areaId,
				'Alpha availability ordering intro.'
			);
			const profileB = await publishMinimalProfile(
				db,
				ownerB,
				areaId,
				'Bravo availability ordering intro.'
			);

			const firstSet = new Date('2026-09-05T10:00:00Z');
			const secondSet = new Date('2026-09-05T11:00:00Z');
			expect((await setAvailabilityForOwner(db, ownerA, 'corr-a1', firstSet)).ok).toBe(true);
			expect((await setAvailabilityForOwner(db, ownerB, 'corr-b1', secondSet)).ok).toBe(true);

			const beforeRenew = await runSearch(
				db,
				{ q: 'ordering intro', lexicon: [], limit: 20 },
				anonymousAuth('127.0.0.1')
			);
			const availableBefore = beforeRenew.cards
				.filter((c) => c.availability.state === 'available')
				.map((c) => c.providerProfileId);
			expect(availableBefore.indexOf(profileB.profileId)).toBeLessThan(
				availableBefore.indexOf(profileA.profileId)
			);

			const renewAt = new Date('2026-09-05T12:00:00Z');
			const renewed = await setAvailabilityForOwner(db, ownerA, 'corr-a2', renewAt);
			expect(renewed.ok).toBe(true);
			if (!renewed.ok) throw new Error('renew failed');
			expect(renewed.value.setAt).toBe(renewAt.toISOString());

			const historyRows = await db.execute<{ event_type: string }>(sql`
				select event_type
				from provider_availability.availability_history
				where provider_profile_id = ${profileA.profileId}::uuid
				order by occurred_at
			`);
			const events = (historyRows as unknown as Array<{ event_type: string }>).map(
				(row) => row.event_type
			);
			expect(events).toEqual(['set', 'renewed']);

			const afterRenew = await runSearch(
				db,
				{ q: 'ordering intro', lexicon: [], limit: 20 },
				anonymousAuth('127.0.0.1')
			);
			const availableAfter = afterRenew.cards
				.filter((c) => c.availability.state === 'available')
				.map((c) => c.providerProfileId);
			expect(availableAfter.indexOf(profileA.profileId)).toBeLessThan(
				availableAfter.indexOf(profileB.profileId)
			);
		});
	});

	it('TC-AVAIL-01d: expiry_warned collapses to available on public profile reads', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail01d');
			const profile = await publishMinimalProfile(
				db,
				ownerId,
				areaId,
				'Expiry warned collapse intro.'
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
				on conflict (provider_profile_id) do update set
					state = excluded.state,
					set_at = excluded.set_at,
					expires_at = excluded.expires_at,
					warned_at = excluded.warned_at,
					updated_at = excluded.updated_at
			`);

			const publicProfile = await getPublicProfile(
				db,
				profile.profileId,
				anonymousAuth('127.0.0.1')
			);
			expect(publicProfile.ok).toBe(true);
			if (!publicProfile.ok) throw new Error('public profile failed');
			expect(publicProfile.value.availability?.state).toBe('available');
			expect(publicProfile.value.availability?.setAt).toBe(setAt.toISOString());
			expect(publicProfile.value.onlineStatus).toBe('online');
		});
	});
});
