import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listIdentityQueue, getIdentityQueueStats } from '$lib/server/modules/trust-and-safety';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const now = new Date();
	const [queue, stats] = await Promise.all([
		listIdentityQueue(db, now),
		getIdentityQueueStats(db, now)
	]);
	return json(success({ queue, stats }));
};
