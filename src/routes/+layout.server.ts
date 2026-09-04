import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { resolveCapabilities } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export async function load({ locals }) {
	const signedIn = locals.auth.role !== 'anonymous';
	let capabilities = null;

	if (signedIn && locals.auth.userId) {
		capabilities = await resolveCapabilities(getDb(), locals.auth.userId);
	}

	return {
		signedIn,
		capabilities,
		activeRole: locals.auth.role
	};
}
