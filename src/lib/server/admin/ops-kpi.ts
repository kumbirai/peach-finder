import type { Database } from '../db';
import { getRegistrationStats, type RegistrationStats } from '../modules/identity-and-access';
import { getActiveListingCount } from '../modules/listing-billing';
import {
	getIdentityQueueStats,
	getReportsQueueStats,
	type IdentityQueueStats,
	type ReportsQueueStats
} from '../modules/trust-and-safety';

export type OpsKpiDashboard = {
	identityQueue: IdentityQueueStats;
	reportsQueue: ReportsQueueStats;
	registrations: RegistrationStats;
	activeListings: number;
	registrationRangeLabel: string;
};

export function parseRegistrationRangeParam(
	raw: string | null,
	now: Date
): { from: Date; to: Date; label: string } {
	const range = raw ?? '7d';
	const match = /^(\d+)d$/.exec(range);
	const days = match ? Math.min(Math.max(Number(match[1]), 1), 365) : 7;
	const from = new Date(now.getTime() - days * 86_400_000);
	return {
		from,
		to: now,
		label: `last ${days} day${days === 1 ? '' : 's'}`
	};
}

export async function loadOpsKpis(
	db: Database,
	now: Date,
	rangeParam: string | null
): Promise<OpsKpiDashboard> {
	const range = parseRegistrationRangeParam(rangeParam, now);
	const [identityQueue, reportsQueue, registrations, activeListings] = await Promise.all([
		getIdentityQueueStats(db, now),
		getReportsQueueStats(db, now),
		getRegistrationStats(db, { from: range.from, to: range.to }),
		getActiveListingCount(db)
	]);

	return {
		identityQueue,
		reportsQueue,
		registrations,
		activeListings,
		registrationRangeLabel: range.label
	};
}
