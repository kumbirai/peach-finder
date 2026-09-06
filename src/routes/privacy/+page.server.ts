import type { Role } from '$lib/server/shared/auth-context';
import { LEGAL_DOCUMENT_VERSIONS } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export function load() {
	return {
		version: LEGAL_DOCUMENT_VERSIONS['privacy-policy']
	};
}
