import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	adminCreateServiceTag,
	listServiceTagsForAdmin
} from '$lib/server/modules/provider-profile';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async () => {
	return json(success(await listServiceTagsForAdmin(getDb())));
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as { name?: string };
	const result = await adminCreateServiceTag(getDb(), { name: String(body.name ?? '') });
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}
	return json(success(result.value), { status: 201 });
};
