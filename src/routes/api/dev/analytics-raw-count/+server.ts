import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { countRawEvents } from '$lib/server/modules/provider-analytics';
import { asId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ url }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}

	const profileId = url.searchParams.get('profileId');
	const eventType = url.searchParams.get('eventType') ?? 'profile_view';
	if (!profileId || eventType !== 'profile_view') {
		return json({ error: 'Invalid query' }, { status: 422 });
	}

	const count = await countRawEvents(
		getDb(),
		asId<'ProviderProfileId'>(profileId),
		'profile_view'
	);
	return json({ data: { count } });
};
