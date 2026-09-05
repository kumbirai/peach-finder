import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listSeekerThreads } from '$lib/server/modules/direct-messaging';
import { listReviewsWrittenBySeeker } from '$lib/server/modules/provider-reviews';

export const _requiredRole: Role = 'anonymous';

export async function load({ locals }) {
	if (!locals.auth.userId || locals.auth.role === 'anonymous') {
		return { threads: [], reviews: [], signedIn: false };
	}

	const db = getDb();
	const [threads, reviews] = await Promise.all([
		listSeekerThreads(db, locals.auth.userId),
		listReviewsWrittenBySeeker(db, locals.auth.userId)
	]);

	return {
		threads: threads.map((t) => ({ ...t, lastActivityAt: t.lastActivityAt.toISOString() })),
		reviews,
		signedIn: true
	};
}
