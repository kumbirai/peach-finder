import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { findUserIdByEmail } from '$lib/server/modules/identity-and-access';
import { getDevMessageState } from '$lib/server/modules/direct-messaging';

export const _requiredRole: Role = 'anonymous';

const QuerySchema = z.object({
	email: z.string().email(),
	providerProfileId: z.string().uuid()
});

export const GET: RequestHandler = async ({ url }) => {
	if (process.env.ALLOW_DEV_HELPERS !== '1') {
		return new Response('Not found', { status: 404 });
	}
	const parsed = QuerySchema.safeParse({
		email: url.searchParams.get('email'),
		providerProfileId: url.searchParams.get('providerProfileId')
	});
	if (!parsed.success) {
		return json({ error: 'Invalid query' }, { status: 422 });
	}

	const db = getDb();
	const userId = await findUserIdByEmail(db, parsed.data.email);
	if (!userId) {
		return json({ data: { messageCount: 0, pendingCount: 0 } });
	}

	const state = await getDevMessageState(db, userId, parsed.data.providerProfileId);
	return json({ data: state });
};
