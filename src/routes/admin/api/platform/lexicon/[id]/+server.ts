import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { updateLexiconEntry } from '$lib/server/modules/platform-configuration';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json()) as {
		term?: string;
		mapsTo?: unknown;
		entryType?: string;
		isActive?: boolean;
	};
	const result = await updateLexiconEntry(getDb(), {
		id: params.id ?? '',
		...body,
		actor: locals.auth,
		correlationId: locals.correlationId
	});
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}
	return json(success(result.value));
};
