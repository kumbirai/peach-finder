import { eq, notInArray } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { listDiscoverableListedProfileIds } from '../../listing-billing/infra/subscription-read';
import {
	getActiveFeaturing,
	getActiveFeaturingActivatedAt
} from '../../listing-billing/infra/featuring-read';
import { listPublishedProfileIds } from '../../provider-profile';
import { getAvailabilityProjectionMirror } from '../../provider-availability/infra/availability-read';
import { getRatingAggregate } from '../../provider-reviews/infra/rating-read';
import { loadBadgeDisplayState } from '../../trust-and-safety/infra/badge-read';
import { upsertSearchProjection } from './projection-upsert';
import { searchProjection } from './schema';

export type ProjectionReconcileResult = {
	upserted: number;
	removed: number;
};

export async function listDiscoverablePublishedProfileIds(
	db: Database
): Promise<ProviderProfileId[]> {
	const published = await listPublishedProfileIds(db);
	const listed = new Set(await listDiscoverableListedProfileIds(db));
	return published.filter((id) => listed.has(id));
}

export async function corruptAvailabilityOnProjection(
	db: Database,
	providerProfileId: ProviderProfileId,
	now = new Date()
): Promise<boolean> {
	const updated = await db
		.update(searchProjection)
		.set({
			availabilityState: 'not_available',
			availabilitySetAt: null,
			updatedAt: now
		})
		.where(eq(searchProjection.providerProfileId, providerProfileId))
		.returning({ id: searchProjection.providerProfileId });
	return updated.length > 0;
}

export async function runSearchProjectionReconcile(
	db: Database,
	now: Date
): Promise<ProjectionReconcileResult> {
	const membership = await listDiscoverablePublishedProfileIds(db);

	return db.transaction(async (tx) => {
		for (const providerProfileId of membership) {
			await upsertSearchProjection(tx, providerProfileId, now);
			await applyAuthoritativeProjectionFields(tx, providerProfileId, now);
		}

		if (membership.length === 0) {
			const removedRows = await tx.delete(searchProjection).returning({
				id: searchProjection.providerProfileId
			});
			return { upserted: 0, removed: removedRows.length };
		}

		const removedRows = await tx
			.delete(searchProjection)
			.where(notInArray(searchProjection.providerProfileId, membership))
			.returning({ id: searchProjection.providerProfileId });

		return { upserted: membership.length, removed: removedRows.length };
	});
}

async function applyAuthoritativeProjectionFields(
	tx: Parameters<typeof upsertSearchProjection>[0],
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<void> {
	const availability = await getAvailabilityProjectionMirror(tx, providerProfileId);
	const available = availability.state === 'available';
	const availabilitySetAt = availability.setAt;

	const rating = await getRatingAggregate(tx, providerProfileId);
	const badges = await loadBadgeDisplayState(tx as unknown as Database, providerProfileId);
	const featuring = await getActiveFeaturing(tx, providerProfileId);
	const featuredSince = featuring
		? ((await getActiveFeaturingActivatedAt(tx, providerProfileId)) ?? now)
		: null;

	const existing = await tx
		.select({ lastActivityAt: searchProjection.lastActivityAt })
		.from(searchProjection)
		.where(eq(searchProjection.providerProfileId, providerProfileId))
		.limit(1);
	const prior = existing[0]?.lastActivityAt;
	const lastActivityAt =
		available && availabilitySetAt
			? prior && prior.getTime() > availabilitySetAt.getTime()
				? prior
				: availabilitySetAt
			: prior;

	await tx
		.update(searchProjection)
		.set({
			availabilityState: available ? 'available' : 'not_available',
			availabilitySetAt,
			ratingAverage: rating.average,
			ratingCount: rating.count,
			badgeIdentityVerified: badges.identityVerified,
			badgeActiveThisWeek: badges.activeThisWeek,
			isFeatured: featuring != null,
			featuredSince,
			lastActivityAt: lastActivityAt ?? now,
			updatedAt: now
		})
		.where(eq(searchProjection.providerProfileId, providerProfileId));
}
