import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { openInAppNotification } from '$lib/server/modules/user-notifications/infra/in-app-open';

export const _requiredRole: Role = 'seeker';

export const GET: RequestHandler = async ({ params, locals }) => {
	const notificationId = params.id;
	if (!notificationId) {
		error(404, 'Notification not found');
	}

	const db = getDb();
	const result = await openInAppNotification(db, locals.auth.userId!, notificationId, new Date());

	if (!result.ok) {
		error(404, 'Notification not found');
	}

	redirect(303, result.deepLinkPath);
};
