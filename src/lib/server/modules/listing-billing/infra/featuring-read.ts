import { and, eq, lt } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import type { FeaturingState } from '../domain/featuring-state';
import { featuringAddons, listings } from './schema';

export type FeaturingSummary = {
	id: string;
	providerProfileId: ProviderProfileId;
	state: FeaturingState;
	currentPeriodEndsAt: string | null;
	cancelAtPeriodEnd: boolean;
};

export async function getActiveFeaturing(
	db: Database | Transaction,
	providerProfileId: ProviderProfileId
): Promise<FeaturingSummary | null> {
	const rows = await db
		.select()
		.from(featuringAddons)
		.where(
			and(
				eq(featuringAddons.providerProfileId, providerProfileId),
				eq(featuringAddons.state, 'active')
			)
		)
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	return {
		id: row.id,
		providerProfileId,
		state: row.state as FeaturingState,
		currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
		cancelAtPeriodEnd: row.cancelAtPeriodEnd
	};
}

export async function listFeaturingRenewalDue(
	db: Database,
	now: Date
): Promise<
	Array<{
		id: string;
		providerProfileId: ProviderProfileId;
		cancelAtPeriodEnd: boolean;
		pspAuthorizationCode: string | null;
		pspCustomerRef: string | null;
	}>
> {
	const rows = await db
		.select({
			id: featuringAddons.id,
			providerProfileId: featuringAddons.providerProfileId,
			cancelAtPeriodEnd: featuringAddons.cancelAtPeriodEnd,
			pspAuthorizationCode: listings.pspAuthorizationCode,
			pspCustomerRef: listings.pspCustomerRef
		})
		.from(featuringAddons)
		.innerJoin(listings, eq(featuringAddons.providerProfileId, listings.providerProfileId))
		.where(and(eq(featuringAddons.state, 'active'), lt(featuringAddons.currentPeriodEndsAt, now)));

	return rows.map((row) => ({
		id: row.id,
		providerProfileId: row.providerProfileId as ProviderProfileId,
		cancelAtPeriodEnd: row.cancelAtPeriodEnd,
		pspAuthorizationCode: row.pspAuthorizationCode,
		pspCustomerRef: row.pspCustomerRef
	}));
}

export async function cancelFeaturingRenewal(
	db: Database,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<boolean> {
	const rows = await db
		.update(featuringAddons)
		.set({
			cancelAtPeriodEnd: true,
			updatedAt: now
		})
		.where(
			and(
				eq(featuringAddons.providerProfileId, providerProfileId),
				eq(featuringAddons.state, 'active')
			)
		)
		.returning({ id: featuringAddons.id });

	return rows.length > 0;
}
