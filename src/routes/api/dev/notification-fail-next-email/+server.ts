import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { armFailNextEmailChannel } from '$lib/server/modules/user-notifications';

export const _requiredRole: Role = 'anonymous';

export const POST: RequestHandler = async () => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}
	armFailNextEmailChannel();
	return json({ data: { armed: true } });
};
