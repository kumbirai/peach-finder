import type { Role } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'admin';

export function load() {
	return {};
}
