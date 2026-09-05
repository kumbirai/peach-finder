import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type UserId } from '$lib/server/shared/ids';
import { blockUser } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'seeker';

const BlockUserSchema = z.object({
	blockedId: z.string().uuid()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
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

	const parsed = BlockUserSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.') || 'body',
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	let blockedId: UserId;
	try {
		blockedId = asId<'UserId'>(parsed.data.blockedId);
	} catch {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'blockedId', message: 'Invalid user id.' }]
				}
			},
			{ status: 422 }
		);
	}

	const db = getDb();
	const result = await blockUser(db, {
		blockerId: locals.auth.userId,
		blockedId,
		now: new Date(),
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
