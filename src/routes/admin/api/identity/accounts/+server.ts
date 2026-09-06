import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { searchAccounts } from '$lib/server/modules/identity-and-access';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const results = await searchAccounts(getDb(), q);
	return json(success({ accounts: results }));
};
