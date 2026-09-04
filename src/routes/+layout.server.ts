import type { Role } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'anonymous';

export function load({ locals }) {
	return {
		signedIn: locals.auth.role !== 'anonymous'
	};
}
