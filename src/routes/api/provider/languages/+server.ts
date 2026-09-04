import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { listActiveLanguages } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const languages = await listActiveLanguages(db);
	return json(success(languages));
};
