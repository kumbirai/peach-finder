import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { resolveCapabilities } from '$lib/server/modules/identity-and-access';
import {
	countTotalUnreadForProviderOwner,
	countTotalUnreadForSeeker
} from '$lib/server/modules/direct-messaging';

export const _requiredRole: Role = 'anonymous';

export async function load({ locals }) {
	const signedIn = locals.auth.role !== 'anonymous';
	let capabilities = null;
	let unreadCounts = { seekerMessages: 0, providerInbox: 0 };

	if (signedIn && locals.auth.userId) {
		const db = getDb();
		capabilities = await resolveCapabilities(db, locals.auth.userId);
		const [seekerMessages, providerInbox] = await Promise.all([
			countTotalUnreadForSeeker(db, locals.auth.userId),
			capabilities.isProvider
				? countTotalUnreadForProviderOwner(db, locals.auth.userId)
				: Promise.resolve(0)
		]);
		unreadCounts = { seekerMessages, providerInbox };
	}

	return {
		signedIn,
		capabilities,
		activeRole: locals.auth.role,
		unreadCounts
	};
}
