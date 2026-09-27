import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	forceConfigTtlElapsed,
	getConfig,
	isConfigKey,
	maybeRefreshAll,
	overwriteCachedConfig,
	type ConfigKey
} from '$lib/server/modules/platform-configuration';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	action: z.enum(['stale', 'refresh']),
	key: z.string(),
	staleValue: z.unknown().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success || !isConfigKey(parsed.data.key)) {
		return json({ error: 'Invalid body' }, { status: 422 });
	}

	const key = parsed.data.key as ConfigKey;
	if (parsed.data.action === 'stale') {
		if (parsed.data.staleValue === undefined) {
			return json({ error: 'staleValue required' }, { status: 422 });
		}
		overwriteCachedConfig(key, parsed.data.staleValue as never);
		return json({ data: { cached: getConfig(key) } });
	}

	forceConfigTtlElapsed();
	await maybeRefreshAll(getDb());
	return json({ data: { cached: getConfig(key) } });
};
