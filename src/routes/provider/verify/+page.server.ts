import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getOwnedProfileDashboard } from '$lib/server/modules/provider-profile';
import { getOwnVerificationStatus } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'provider';

export async function load({ locals }) {
	const db = getDb();
	const dashboard = await getOwnedProfileDashboard(db, locals.auth.userId!);
	if (!dashboard) {
		return {
			profile: null,
			verification: null
		};
	}

	const verification = await getOwnVerificationStatus(db, dashboard.profileId);
	return {
		profile: dashboard,
		verification
	};
}
