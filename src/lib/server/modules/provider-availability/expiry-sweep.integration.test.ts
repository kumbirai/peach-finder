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
	getAvailabilityStatusForOwner,
	loadAvailabilityStatus,
	runAvailabilityExpirySweep,
	runAvailabilityLifecycleTick,
	runAvailabilityWarningTick,
	setAvailabilityForOwner
} from '../provider-availability';
import {
	handleAvailabilityExpiryWarned,
	listUnreadInAppNotifications,
	dispatchUndispatchedAvailabilityExpiryWarnings
} from '../user-notifications';
import { publish } from '../../shared/outbox';
import { outbox } from '../../shared/schema';
import { isNull } from 'drizzle-orm';
import type { AreaId, UserId } from '../../shared/ids';
import { anonymousAuth } from '../../shared/auth-context';
import { asInstant } from '../../shared/clock';

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
	areaId: AreaId
) {
	const now = new Date();
	await createDraftProfile(db, ownerId, areaId);
	await attachOnboardingPhoto(db, ownerId, crypto.randomUUID(), now);
	await updateIntro(db, ownerId, 'Expiry sweep integration intro.', crypto.randomUUID(), now);
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

describe('US-AVAIL-03 the signal cannot go stale', () => {
	it('TC-AVAIL-03a: sweep expires overdue rows within one tick', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail03a');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			const setAt = new Date('2026-09-05T08:00:00Z');
			const expiresAt = new Date('2026-09-05T12:00:00Z');
			const sweepAt = new Date('2026-09-05T12:00:01Z');

			await setAvailabilityForOwner(db, ownerId, 'corr-set', setAt);
			await db.execute(sql`
				update provider_availability.availability_status
				set set_at = ${setAt.toISOString()}::timestamptz,
				    expires_at = ${expiresAt.toISOString()}::timestamptz,
				    updated_at = ${setAt.toISOString()}::timestamptz
				where provider_profile_id = ${profile.profileId}::uuid
			`);

			const expired = await runAvailabilityExpirySweep(db, sweepAt, 'corr-sweep');
			expect(expired).toContain(profile.profileId);

			const status = await loadAvailabilityStatus(db, profile.profileId as never);
			expect(status.kind).toBe('NotAvailable');

			const search = await runSearch(
				db,
				{ q: 'Expiry sweep', lexicon: [], limit: 20, available: true },
				anonymousAuth('127.0.0.1')
			);
			expect(search.cards.find((c) => c.providerProfileId === profile.profileId)).toBeUndefined();
		});
	});

	it('TC-AVAIL-03b: warning tick notifies provider with renewal prompt', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail03b');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			const setAt = new Date('2026-09-05T08:00:00Z');
			const expiresAt = new Date('2026-09-05T12:00:00Z');
			const warnAt = new Date('2026-09-05T11:45:00Z');

			await setAvailabilityForOwner(db, ownerId, 'corr-set', setAt);
			await db.execute(sql`
				update provider_availability.availability_status
				set state = 'available',
				    set_at = ${setAt.toISOString()}::timestamptz,
				    expires_at = ${expiresAt.toISOString()}::timestamptz,
				    warned_at = null,
				    updated_at = ${setAt.toISOString()}::timestamptz
				where provider_profile_id = ${profile.profileId}::uuid
			`);

			const warned = await runAvailabilityWarningTick(db, warnAt, 'corr-warn');
			expect(warned).toHaveLength(1);
			expect(warned[0]?.providerProfileId).toBe(profile.profileId);

			const ownerStatus = await getAvailabilityStatusForOwner(db, ownerId, warnAt);
			expect(ownerStatus.ok).toBe(true);
			if (!ownerStatus.ok) throw new Error('status missing');
			expect(ownerStatus.value.state).toBe('expiry_warned');

			await handleAvailabilityExpiryWarned(db, {
				eventId: crypto.randomUUID() as never,
				eventName: 'AvailabilityExpiryWarned',
				version: 1,
				occurredAt: asInstant(warnAt.toISOString()),
				correlationId: 'corr-notif',
				payload: {
					providerProfileId: profile.profileId,
					expiresAt: expiresAt.toISOString()
				}
			});

			const notifications = await listUnreadInAppNotifications(db, ownerId, 5);
			expect(notifications.some((n) => n.category === 'availability_expiry_warning')).toBe(true);

			const renewedAt = new Date('2026-09-05T11:50:00Z');
			const renewed = await setAvailabilityForOwner(db, ownerId, 'corr-renew', renewedAt);
			expect(renewed.ok).toBe(true);
			if (!renewed.ok) throw new Error('renew failed');
			expect(renewed.value.state).toBe('available');
			expect(new Date(renewed.value.setAt!).getTime()).toBe(renewedAt.getTime());
		});
	});

	it('TC-AVAIL-03c: expired profile shows neutral not-available state', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail03c');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			const setAt = new Date('2026-09-05T08:00:00Z');
			const expiresAt = new Date('2026-09-05T12:00:00Z');
			const sweepAt = new Date('2026-09-05T12:00:30Z');

			await setAvailabilityForOwner(db, ownerId, 'corr-set', setAt);
			await db.execute(sql`
				update provider_availability.availability_status
				set expires_at = ${expiresAt.toISOString()}::timestamptz
				where provider_profile_id = ${profile.profileId}::uuid
			`);

			await runAvailabilityLifecycleTick(db, sweepAt, 'corr-lifecycle');

			const publicProfile = await getPublicProfile(
				db,
				profile.profileId as never,
				anonymousAuth('127.0.0.1')
			);
			expect(publicProfile.ok).toBe(true);
			if (!publicProfile.ok) throw new Error('profile missing');
			expect(publicProfile.value.availability.state).toBe('not_available');
			expect(publicProfile.value.availability.setAt).toBeNull();
		});
	});

	it('TC-AVAIL-03d: renewal prompt is suppressed after auto-expire', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail03d');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			const setAt = new Date('2026-09-05T08:00:00Z');
			const expiresAt = new Date('2026-09-05T12:00:00Z');
			const warnAt = new Date('2026-09-05T11:45:00Z');
			const sweepAt = new Date('2026-09-05T12:00:30Z');

			await setAvailabilityForOwner(db, ownerId, 'corr-set', setAt);
			await db.execute(sql`
				update provider_availability.availability_status
				set expires_at = ${expiresAt.toISOString()}::timestamptz
				where provider_profile_id = ${profile.profileId}::uuid
			`);

			await runAvailabilityLifecycleTick(db, warnAt, 'corr-warn');
			await handleAvailabilityExpiryWarned(db, {
				eventId: crypto.randomUUID() as never,
				eventName: 'AvailabilityExpiryWarned',
				version: 1,
				occurredAt: asInstant(warnAt.toISOString()),
				correlationId: 'corr-notif',
				payload: {
					providerProfileId: profile.profileId,
					expiresAt: expiresAt.toISOString()
				}
			});

			await runAvailabilityLifecycleTick(db, sweepAt, 'corr-expire');

			const availability = await getAvailabilityStatusForOwner(db, ownerId, sweepAt);
			expect(availability.ok).toBe(true);
			if (!availability.ok) throw new Error('status missing');
			expect(availability.value.state).toBe('not_available');

			const notifications = await listUnreadInAppNotifications(db, ownerId, 5);
			expect(notifications.some((n) => n.category === 'availability_expiry_warning')).toBe(true);

			const renewalNotification =
				availability.value.state !== 'not_available'
					? (notifications.find((n) => n.category === 'availability_expiry_warning') ?? null)
					: null;
			expect(renewalNotification).toBeNull();
		});
	});

	it('TC-AVAIL-03e: inline warning dispatch does not mark unrelated outbox events', async () => {
		await withTestDatabase(async (db) => {
			process.env.ALLOW_DEV_HELPERS = '1';
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);
			const areas = await listAreas(db);
			const areaId = areas.find((a) => a.slug === 'rosebank')!.id as AreaId;

			const ownerId = await registerVerifiedProvider(db, areaId, 'avail03e');
			const profile = await publishMinimalProfile(db, ownerId, areaId);
			const setAt = new Date('2026-09-05T08:00:00Z');
			const expiresAt = new Date('2026-09-05T12:00:00Z');
			const warnAt = new Date('2026-09-05T11:45:00Z');
			const correlationId = 'corr-inline-warn';

			await setAvailabilityForOwner(db, ownerId, 'corr-set', setAt);
			await db.execute(sql`
				update provider_availability.availability_status
				set expires_at = ${expiresAt.toISOString()}::timestamptz
				where provider_profile_id = ${profile.profileId}::uuid
			`);

			await db.transaction(async (tx) => {
				await publish(tx, {
					eventId: crypto.randomUUID() as never,
					eventName: 'ProviderPublished',
					version: 1,
					occurredAt: asInstant(setAt.toISOString()),
					correlationId: 'corr-unrelated',
					payload: { providerProfileId: profile.profileId }
				});
			});

			await runAvailabilityLifecycleTick(db, warnAt, correlationId);
			await dispatchUndispatchedAvailabilityExpiryWarnings(db, correlationId);

			const undispatched = await db
				.select({ eventName: outbox.eventName, correlationId: outbox.correlationId })
				.from(outbox)
				.where(isNull(outbox.dispatchedAt));

			expect(undispatched.some((row) => row.correlationId === 'corr-unrelated')).toBe(true);
			expect(
				undispatched.some(
					(row) =>
						row.correlationId === correlationId && row.eventName === 'AvailabilityExpiryWarned'
				)
			).toBe(false);
		});
	});
});
