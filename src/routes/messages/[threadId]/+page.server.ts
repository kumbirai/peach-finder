import { error } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId, type ThreadId } from '$lib/server/shared/ids';
import { getThreadHeader, listThreadMessages } from '$lib/server/modules/direct-messaging';

export const _requiredRole: Role = 'seeker';

function parseThreadId(raw: string): ThreadId | null {
	try {
		return asId<'ThreadId'>(raw);
	} catch {
		return null;
	}
}

export async function load({ params, locals, url }) {
	if (!locals.auth.userId) error(401, 'Sign in required');

	const threadId = parseThreadId(params.threadId ?? '');
	if (!threadId) error(404, 'Thread not found');

	const db = getDb();
	const header = await getThreadHeader(db, threadId, locals.auth.userId);
	if (!header.ok) error(404, 'Thread not found');

	const listed = await listThreadMessages(db, threadId, locals.auth.userId, { limit: 50 });
	if (!listed.ok) error(404, 'Thread not found');

	return {
		threadId,
		viewerId: locals.auth.userId,
		counterpartName: header.value.counterpartName,
		counterpartUserId: header.value.counterpartUserId,
		viewerRole: header.value.viewerRole,
		messages: listed.value.messages,
		forcePolling: url.searchParams.get('forcePolling') === '1',
		backHref: header.value.viewerRole === 'provider' ? '/provider/dashboard' : '/messages'
	};
}
