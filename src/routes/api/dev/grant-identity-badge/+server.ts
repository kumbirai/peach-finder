import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { getOwnedProfileIdDb } from '$lib/server/modules/provider-profile';
import { grantIdentityBadgeDev } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ locals }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}
	if (!locals.auth.userId) {
		return json({ error: 'Unauthenticated' }, { status: 401 });
	}

	const db = getDb();
	const profileId = await getOwnedProfileIdDb(db, locals.auth.userId);
	if (!profileId) {
		return json({ error: 'No provider profile' }, { status: 404 });
	}

	const now = new Date();
	await grantIdentityBadgeDev(db, profileId, now);

	return json(success({ profileId, identityVerified: true }));
};
