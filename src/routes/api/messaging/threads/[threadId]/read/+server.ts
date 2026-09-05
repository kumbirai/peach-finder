import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { success } from '$lib/server/shared/api';
import { zId } from '$lib/server/shared/zod';
import { asId, type MessageId, type ThreadId } from '$lib/server/shared/ids';
import { markThreadReadAndNotify } from '$lib/server/ws/hub';

export const _requiredRole: Role = 'seeker';

const MarkReadSchema = z.object({
	upToMessageId: zId<'MessageId'>()
});

function parseThreadId(raw: string): ThreadId | null {
	try {
		return asId<'ThreadId'>(raw);
	} catch {
		return null;
	}
}

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

	const parsed = MarkReadSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	await markThreadReadAndNotify(
		threadId,
		locals.auth.userId,
		parsed.data.upToMessageId as MessageId
	);

	return json(success({ marked: true }));
};
