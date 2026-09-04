import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'seeker';

export const GET: RequestHandler = async ({ locals }) => {
	return json(success({ role: locals.auth.role, userId: locals.auth.userId }));
};
