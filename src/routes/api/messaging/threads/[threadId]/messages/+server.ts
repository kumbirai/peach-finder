import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type ThreadId } from '$lib/server/shared/ids';
import { sendMessageInThread, validateMessageBody } from '$lib/server/modules/direct-messaging';
import { consumeRateLimit, bucketSpec } from '$lib/server/shared/rate-limit';
import { notifyMessageSent } from '$lib/server/ws/hub';
import { listThreadMessages } from '$lib/server/modules/direct-messaging/infra/messaging-queries';

export const _requiredRole: Role = 'seeker';

const SendMessageSchema = z.object({
	body: z.string().min(1).max(4000)
});

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

	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Number(limitParam) : undefined;
	const cursor = url.searchParams.get('cursor') ?? undefined;

	const db = getDb();
	const result = await listThreadMessages(db, threadId, locals.auth.userId, {
		...(limit != null && !Number.isNaN(limit) ? { limit } : {}),
		...(cursor ? { cursor } : {})
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value.messages, { nextCursor: result.value.nextCursor }));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
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

	const db = getDb();
	const now = new Date();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('message_send'),
		`account:${locals.auth.userId}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Invalid JSON.',
					fields: null
				}
			},
			{ status: 422 }
		);
	}

	const parsed = SendMessageSchema.safeParse(body);
	if (!parsed.success) {
		const message = validateMessageBody(String((body as { body?: string })?.body ?? ''));
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [
						{
							path: 'body',
							message: message ?? parsed.error.issues[0]?.message ?? 'Invalid message.'
						}
					]
				}
			},
			{ status: 422 }
		);
	}

	const result = await sendMessageInThread(db, {
		threadId,
		senderId: locals.auth.userId,
		body: parsed.data.body,
		now,
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	await notifyMessageSent({
		threadId: result.value.threadId,
		messageId: result.value.messageId,
		senderId: locals.auth.userId,
		recipientId: result.value.recipientId,
		body: parsed.data.body.trim(),
		sentAt: now
	});

	return json(
		success({
			threadId: result.value.threadId,
			messageId: result.value.messageId
		})
	);
};
