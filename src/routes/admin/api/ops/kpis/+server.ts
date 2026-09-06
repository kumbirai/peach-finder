import { json, type RequestHandler } from '@sveltejs/kit';
import { loadOpsKpis } from '$lib/server/admin/ops-kpi';
import { getDb } from '$lib/server/db';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const now = new Date();
	const kpis = await loadOpsKpis(db, now, url.searchParams.get('range'));
	return json(success(kpis));
};
