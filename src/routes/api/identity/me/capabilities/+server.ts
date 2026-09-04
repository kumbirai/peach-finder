import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success } from '$lib/server/shared/api';
import { resolveCapabilities } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'seeker';

export const GET: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const capabilities = await resolveCapabilities(db, locals.auth.userId!);
	return json(success(capabilities));
};
