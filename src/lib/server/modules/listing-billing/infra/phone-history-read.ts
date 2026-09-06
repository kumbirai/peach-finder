import { and, desc, eq, ne } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import type { PriorListingState } from '../domain/trial-eligibility';
import { listings } from './schema';

export async function findPriorListingByPhoneRef(
	tx: Transaction,
	phoneHistoryRef: string,
	excludeProfileId: ProviderProfileId
): Promise<PriorListingState | null> {
	const rows = await tx
		.select({
			providerProfileId: listings.providerProfileId,
			state: listings.state,
			trialStartedAt: listings.trialStartedAt,
			trialEndsAt: listings.trialEndsAt,
			graceEndsAt: listings.graceEndsAt
		})
		.from(listings)
		.where(
			and(
				eq(listings.phoneHistoryRef, phoneHistoryRef),
				ne(listings.providerProfileId, excludeProfileId)
			)
		)
		.orderBy(desc(listings.updatedAt))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	return {
		providerProfileId: row.providerProfileId,
		state: row.state,
		trialStartedAt: row.trialStartedAt,
		trialEndsAt: row.trialEndsAt,
		graceEndsAt: row.graceEndsAt
	};
}

export async function primePhoneHistoryRef(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	phoneHistoryRef: string,
	now: Date
): Promise<void> {
	await tx
		.update(listings)
		.set({ phoneHistoryRef, updatedAt: now })
		.where(and(eq(listings.providerProfileId, providerProfileId), eq(listings.state, 'building')));
}
