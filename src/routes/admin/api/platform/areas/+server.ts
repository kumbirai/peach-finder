import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { createArea, listAreas } from '$lib/server/modules/platform-configuration';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async () => {
	return json(success(await listAreas(getDb())));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as {
		name: string;
		slug: string;
		centroidLat: number;
		centroidLng: number;
		parentAreaId?: string | null;
	};
	const result = await createArea(getDb(), {
		...body,
		actor: locals.auth,
		correlationId: locals.correlationId
	});
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}
	return json(success(result.value), { status: 201 });
};
