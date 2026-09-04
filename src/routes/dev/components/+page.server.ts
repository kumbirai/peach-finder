import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'anonymous';

export function load() {
	if (!dev && process.env.ENABLE_DEV_ROUTES !== 'true') {
		error(404, 'Not found');
	}
	return {};
}
