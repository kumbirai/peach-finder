import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import type { BillingContinuity } from '../domain/trial-eligibility';
import { listings } from './schema';

const LIVE_LISTING_STATES = ['free_listed', 'paid_listed'] as const;

export type SubscriptionSummary = {
	providerProfileId: ProviderProfileId;
	state: string;
	trialStartedAt: string | null;
	trialEndsAt: string | null;
	graceEndsAt: string | null;
	billingContinuity: BillingContinuity;
	pspCustomerRef: string | null;
	cancelAtPeriodEnd: boolean;
	currentPeriodEndsAt: string | null;
	cardLast4: string | null;
	cardBrand: string | null;
	updatedAt: string;
	listingLabel: string;
};

export function listingStateLabel(state: string): string {
	switch (state) {
		case 'free_listed':
		case 'paid_listed':
			return 'Active listing';
		case 'grace':
			return 'Grace period';
		case 'unpublished':
			return 'Unpublished';
		case 'building':
			return 'Building';
		default:
			return state;
	}
}

export async function getSubscription(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<SubscriptionSummary | null> {
	const rows = await db
		.select()
		.from(listings)
		.where(eq(listings.providerProfileId, providerProfileId))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	return {
		providerProfileId,
		state: row.state,
		trialStartedAt: row.trialStartedAt?.toISOString() ?? null,
		trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
		graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
		billingContinuity: (row.billingContinuity as BillingContinuity) ?? 'new',
		pspCustomerRef: row.pspCustomerRef,
		cancelAtPeriodEnd: row.cancelAtPeriodEnd,
		currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
		cardLast4: row.cardLast4,
		cardBrand: row.cardBrand,
		updatedAt: row.updatedAt.toISOString(),
		listingLabel: listingStateLabel(row.state)
	};
}

export async function getActiveListingCount(db: Database): Promise<number> {
	const result = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(listings)
		.where(inArray(listings.state, [...LIVE_LISTING_STATES]));

	return result[0]?.count ?? 0;
}
