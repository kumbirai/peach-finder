import type { Role } from '$lib/server/shared/auth-context';
import { parseGatedAction } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export function load({ url }) {
	const returnTo = url.searchParams.get('returnTo') ?? '/';
	const action = parseGatedAction(url.searchParams.get('action'));
	const providerProfileId = url.searchParams.get('providerProfileId');

	return {
		returnTo,
		action,
		providerProfileId
	};
}
