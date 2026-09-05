import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type ThreadId } from '$lib/server/shared/ids';
import { pollThreadMessages } from '$lib/server/modules/direct-messaging/infra/messaging-queries';
import { notifyMessageDelivered } from '$lib/server/ws/hub';

export const _requiredRole: Role = 'seeker';

function parseThreadId(raw: string): ThreadId | null {
	try {
		return asId<'ThreadId'>(raw);
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	const threadId = parseThreadId(params.threadId ?? '');
	if (!threadId) {
		return json(
			{ error: { code: 'THREAD_NOT_FOUND', message: 'We could not find that.', fields: null } },
			{ status: 404 }
		);
	}

	const since = url.searchParams.get('since') ?? undefined;
	const db = getDb();
	const result = await pollThreadMessages(db, threadId, locals.auth.userId, since);

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	for (const update of result.value.deliveredUpdates) {
		const message = result.value.messages.find((m) => m.id === update.messageId);
		if (message?.sender.id) {
			notifyMessageDelivered({
				threadId,
				messageId: update.messageId,
				senderId: message.sender.id as import('$lib/server/shared/ids').UserId,
				deliveredAt: update.deliveredAt
			});
		}
	}

	return json(
		success(
			{
				messages: result.value.messages,
				deliveredUpdates: result.value.deliveredUpdates,
				readUpdates: result.value.readUpdates
			},
			{ nextCursor: result.value.cursor }
		)
	);
};
