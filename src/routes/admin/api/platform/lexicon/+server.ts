import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { createLexiconEntry, listLexicon } from '$lib/server/modules/platform-configuration';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const GET: RequestHandler = async () => {
	return json(success(await listLexicon(getDb())));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { term: string; entryType: string; mapsTo: unknown };
	const result = await createLexiconEntry(getDb(), {
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
