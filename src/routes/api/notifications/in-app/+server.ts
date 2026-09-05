import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listUnreadInAppNotifications } from '$lib/server/modules/user-notifications';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'seeker';

export const GET: RequestHandler = async ({ locals, url }) => {
	const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
	const db = getDb();
	const notifications = await listUnreadInAppNotifications(db, locals.auth.userId!, limit);
	return json(success(notifications, { nextCursor: null }));
};
