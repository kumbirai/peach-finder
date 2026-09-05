import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { loadOwnerProfile, publishProfileForOwner } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export const POST: RequestHandler = async ({ locals }) => {
	const db = getDb();
	const result = await publishProfileForOwner(
		db,
		locals.auth.userId!,
		crypto.randomUUID(),
		new Date()
	);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	return json(success(profile));
};
