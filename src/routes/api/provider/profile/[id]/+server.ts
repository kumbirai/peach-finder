import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { getPublicProfile, parseProviderProfileId } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ params, locals }) => {
	const db = getDb();
	const parsed = parseProviderProfileId(params.id!);
	if (!parsed.ok) {
		const mapped = useCaseErrorToHttp(parsed.error);
		return json(mapped.body, { status: mapped.status });
	}
	const result = await getPublicProfile(db, parsed.value, locals.auth);
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}
	return json(success(result.value));
};
