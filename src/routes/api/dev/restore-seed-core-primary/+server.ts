import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { restoreSeedCorePrimaryListing } from '$lib/server/modules/provider-profile/infra/restore-seed-core-primary';

export const _requiredRole: Role = 'anonymous';

/** Dev-only: republish seed-core Amara and reconcile search when moderation tests leave her hidden. */
export const POST: RequestHandler = async ({ locals }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const db = getDb();
	const result = await restoreSeedCorePrimaryListing(db, new Date(), locals.correlationId);
	return json({ data: result });
};
