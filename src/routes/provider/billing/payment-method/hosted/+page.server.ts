import { error } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';

export const _requiredRole: Role = 'provider';

export function load({ url }) {
	const reference = url.searchParams.get('reference');
	const callback = url.searchParams.get('callback');
	if (!reference || !callback) {
		error(400, 'Invalid hosted checkout link.');
	}
	return { reference, callback };
}
