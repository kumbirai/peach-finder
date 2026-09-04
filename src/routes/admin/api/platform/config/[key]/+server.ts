import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { updateConfig } from '$lib/server/modules/platform-configuration';
import { SystemClock } from '$lib/server/shared/clock';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';

export const _requiredRole: Role = 'admin';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const body: unknown = await request.json();
	const value =
		body && typeof body === 'object' && 'value' in body ? (body as { value: unknown }).value : body;
	const result = await updateConfig(getDb(), {
		key: params.key ?? '',
		value,
		actor: locals.auth,
		clock: new SystemClock(),
		correlationId: locals.correlationId
	});
	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		const headers: HeadersInit = {};
		if (result.error.kind === 'rate_limited') {
			headers['retry-after'] = String(result.error.retryAfterSeconds);
		}
		return json(mapped.body, { status: mapped.status, headers });
	}
	return json(success(result.value));
};
