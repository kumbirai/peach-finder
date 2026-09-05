import type { Role } from '$lib/server/shared/auth-context';
import { listConfig } from '$lib/server/modules/platform-configuration';

export const _requiredRole: Role = 'admin';

export async function load() {
	const config = await listConfig();
	return { config };
}
