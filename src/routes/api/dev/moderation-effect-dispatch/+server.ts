import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { dispatchPendingProviderProfileModerationEffects } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'anonymous';

export const POST: RequestHandler = async () => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const db = getDb();
	const handled = await dispatchPendingProviderProfileModerationEffects(db);
	return json({ data: { handled } });
};
