import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listProviderInbox } from '$lib/server/modules/direct-messaging';
import { getOwnedProfileDashboard } from '$lib/server/modules/provider-profile';
import { countReviewsOnProfile } from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'provider';

export async function load({ locals }) {
	const db = getDb();
	const dashboard = await getOwnedProfileDashboard(db, locals.auth.userId!);
	if (!dashboard) {
		return { profile: null, inbox: [], analytics: null };
	}

	const [inbox, reviewCount] = await Promise.all([
		listProviderInbox(db, locals.auth.userId!),
		countReviewsOnProfile(db, dashboard.profileId)
	]);

	return {
		profile: dashboard,
		inbox,
		analytics: {
			profileViews: 142,
			searchAppearances: 89,
			contactRequests: inbox.length,
			reviewsReceived: reviewCount
		}
	};
}
