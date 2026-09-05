import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getAvailabilityTransparencyForOwner } from '$lib/server/modules/provider-availability';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'provider';

export const GET: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const result = await getAvailabilityTransparencyForOwner(db, locals.auth.userId!, new Date());
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success(result.value));
};
