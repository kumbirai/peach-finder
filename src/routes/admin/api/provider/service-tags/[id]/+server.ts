import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { adminRetireServiceTag, adminUpdateServiceTag } from '$lib/server/modules/provider-profile';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as { name?: string };
	const result = await adminUpdateServiceTag(getDb(), {
		id: params.id ?? '',
		name: String(body.name ?? '')
	});
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}
	return json(success(result.value));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const result = await adminRetireServiceTag(getDb(), { id: params.id ?? '' });
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}
	return json(success(result.value));
};
