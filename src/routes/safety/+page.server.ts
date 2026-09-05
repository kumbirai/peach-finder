import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { loadConfigCache } from '$lib/server/modules/platform-configuration';
import { getSafetyInfo } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'anonymous';

export async function load() {
	const db = getDb();
	await loadConfigCache(db);
	return getSafetyInfo();
}
