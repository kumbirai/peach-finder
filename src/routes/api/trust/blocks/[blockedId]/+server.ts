import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { asId, type UserId } from '$lib/server/shared/ids';
import { unblockUser } from '$lib/server/modules/trust-and-safety';

export const _requiredRole: Role = 'seeker';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.auth.userId) {
		return json(
			{ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.', fields: null } },
			{ status: 401 }
		);
	}

	let blockedId: UserId;
	try {
		blockedId = asId<'UserId'>(params.blockedId!);
	} catch {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Invalid user id.',
					fields: [{ path: 'blockedId', message: 'Invalid user id.' }]
				}
			},
			{ status: 422 }
		);
	}

	const db = getDb();
	const result = await unblockUser(db, {
		blockerId: locals.auth.userId,
		blockedId,
		now: new Date(),
		correlationId: locals.correlationId
	});

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success({ blocked: false }));
};
