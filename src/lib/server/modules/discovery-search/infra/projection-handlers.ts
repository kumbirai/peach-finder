import { eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { getDisplayIdentity } from '../../identity-and-access';
import { asId } from '../../../shared/ids';
import { searchProjection } from './schema';
import { upsertSearchProjection } from './projection-upsert';

export async function refreshSearchProjection(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<void> {
	const published = await tx.execute<{ publish_state: string }>(sql`
		select publish_state from provider_profile.provider_profile
		where id = ${providerProfileId}::uuid
		limit 1
	`);
	const row = (published as unknown as Array<{ publish_state: string }>)[0];
	if (row?.publish_state !== 'published') return;
	await upsertSearchProjection(tx, providerProfileId, now);
}

export async function refreshSearchDisplayName(
	tx: Transaction,
	userId: string,
	now: Date
): Promise<void> {
	const profileRows = await tx.execute<{ id: string }>(sql`
		select id from provider_profile.provider_profile
		where owner_id = ${userId}::uuid
		  and publish_state = 'published'
		limit 1
	`);
	const profileId = (profileRows as unknown as Array<{ id: string }>)[0]?.id;
	if (!profileId) return;

	const identity = await getDisplayIdentity(tx, asId<'UserId'>(userId));
	await tx
		.update(searchProjection)
		.set({
			displayName: identity.isDeleted ? 'Former user' : identity.displayName,
			updatedAt: now
		})
		.where(eq(searchProjection.providerProfileId, profileId));
}

export async function mirrorAvailabilityOnProjection(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	availabilityState: 'available' | 'not_available',
	availabilitySetAt: Date | null,
	now: Date
): Promise<void> {
	const published = await tx.execute<{ publish_state: string }>(sql`
		select publish_state from provider_profile.provider_profile
		where id = ${providerProfileId}::uuid
		limit 1
	`);
	const row = (published as unknown as Array<{ publish_state: string }>)[0];
	if (row?.publish_state !== 'published') return;

	if (availabilityState === 'available' && availabilitySetAt) {
		const existing = await tx
			.select({ lastActivityAt: searchProjection.lastActivityAt })
			.from(searchProjection)
			.where(eq(searchProjection.providerProfileId, providerProfileId))
			.limit(1);
		const prior = existing[0]?.lastActivityAt;
		const lastActivityAt =
			prior && prior.getTime() > availabilitySetAt.getTime() ? prior : availabilitySetAt;

		await tx
			.update(searchProjection)
			.set({
				availabilityState: 'available',
				availabilitySetAt,
				lastActivityAt,
				updatedAt: now
			})
			.where(eq(searchProjection.providerProfileId, providerProfileId));
		return;
	}

	await tx
		.update(searchProjection)
		.set({
			availabilityState: 'not_available',
			availabilitySetAt: null,
			updatedAt: now
		})
		.where(eq(searchProjection.providerProfileId, providerProfileId));
}

export async function updateSearchBadgeFlag(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	badge: string,
	granted: boolean,
	now: Date
): Promise<void> {
	if (badge === 'identity_verified') {
		await tx
			.update(searchProjection)
			.set({ badgeIdentityVerified: granted, updatedAt: now })
			.where(eq(searchProjection.providerProfileId, providerProfileId));
		return;
	}
	if (badge === 'active_this_week') {
		await tx
			.update(searchProjection)
			.set({ badgeActiveThisWeek: granted, updatedAt: now })
			.where(eq(searchProjection.providerProfileId, providerProfileId));
	}
}
