import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { listConfig } from '$lib/server/modules/platform-configuration';
import { success } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async () => {
	const data = await listConfig();
	return json(success(data));
};
