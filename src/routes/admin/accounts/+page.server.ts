import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getAccountSummary, searchAccounts } from '$lib/server/modules/identity-and-access';
import { getOwnedProfileIdDb } from '$lib/server/modules/provider-profile';
import { getSubscription } from '$lib/server/modules/listing-billing';
import {
	getAccountTrustSummary,
	loadBadgeDisplayState
} from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'admin';

export type AdminAccountLookupItem = {
	userId: string;
	displayName: string;
	email: string | null;
	phone: string | null;
	roleLabel: string;
	verificationLabel: string;
	joinedLabel: string;
	listingLabel: string | null;
	openReportsCount: number;
	lastModerationLabel: string;
	identityVerified: boolean;
	activeThisWeek: boolean;
	providerProfileId: string | null;
	reportHistory: Array<{
		reportId: string;
		role: 'filed' | 'received';
		reasonLabel: string;
		status: string;
		createdAt: string;
	}>;
	moderationHistory: Array<{
		moderationActionId: string;
		actionLabel: string;
		reason: string;
		createdAt: string;
	}>;
	billing: {
		state: string;
		listingLabel: string;
		trialEndsAt: string | null;
		updatedAt: string;
	} | null;
};

function roleLabel(summary: { isAdmin: boolean; isProvider: boolean }): string {
	if (summary.isAdmin) return 'Admin';
	const parts = ['Seeker'];
	if (summary.isProvider) parts.push('Provider');
	return parts.join(' + ');
}

function verificationLabel(summary: { emailVerified: boolean; phoneVerified: boolean }): string {
	const parts: string[] = [];
	if (summary.emailVerified) parts.push('email verified');
	if (summary.phoneVerified) parts.push('phone verified');
	return parts.length > 0 ? parts.join(' · ') : 'not verified';
}

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) {
		return { query: q, results: [] as AdminAccountLookupItem[] };
	}

	const db = getDb();
	const hits = await searchAccounts(db, q);
	const results: AdminAccountLookupItem[] = [];

	for (const hit of hits) {
		const summary = await getAccountSummary(db, hit.userId);
		if (!summary) continue;

		const providerProfileId = summary.isProvider ? await getOwnedProfileIdDb(db, hit.userId) : null;

		const [trust, badge, billing] = await Promise.all([
			getAccountTrustSummary(db, hit.userId, providerProfileId),
			providerProfileId ? loadBadgeDisplayState(db, providerProfileId) : null,
			providerProfileId ? getSubscription(db, providerProfileId) : null
		]);

		results.push({
			userId: summary.userId,
			displayName: summary.displayName,
			email: summary.email,
			phone: summary.phone,
			roleLabel: roleLabel(summary),
			verificationLabel: verificationLabel(summary),
			joinedLabel: new Date(summary.createdAt).toLocaleDateString('en-ZA'),
			listingLabel: billing?.listingLabel ?? null,
			openReportsCount: trust.openReportsCount,
			lastModerationLabel: trust.lastModerationLabel,
			identityVerified: badge?.identityVerified ?? false,
			activeThisWeek: badge?.activeThisWeek ?? false,
			providerProfileId,
			reportHistory: trust.reportHistory,
			moderationHistory: trust.moderationHistory,
			billing: billing
				? {
						state: billing.state,
						listingLabel: billing.listingLabel,
						trialEndsAt: billing.trialEndsAt,
						updatedAt: billing.updatedAt
					}
				: null
		});
	}

	return { query: q, results };
};
