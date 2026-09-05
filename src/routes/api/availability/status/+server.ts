import { json, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	clearAvailabilityForOwner,
	setAvailabilityForOwner
} from '$lib/server/modules/provider-availability';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';

export const _requiredRole: Role = 'provider';

async function enforceRateLimit(
	request: Request,
	userId: string,
	now: Date
): Promise<Response | null> {
	const db = getDb();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('availability_toggle'),
		`account:${userId}`,
		now
	);
	if (!limited.ok) {
		return json(
			{
				error: {
					code: 'RATE_LIMITED',
					message: 'Too many availability changes. Please wait a moment.',
					fields: null
				}
			},
			{ status: 429 }
		);
	}
	return null;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const now = new Date();
	const limited = await enforceRateLimit(request, locals.auth.userId!, now);
	if (limited) return limited;

	const db = getDb();
	const result = await setAvailabilityForOwner(db, locals.auth.userId!, crypto.randomUUID(), now);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success(result.value));
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	const now = new Date();
	const limited = await enforceRateLimit(request, locals.auth.userId!, now);
	if (limited) return limited;

	const db = getDb();
	const result = await clearAvailabilityForOwner(db, locals.auth.userId!, crypto.randomUUID(), now);
	if (!result.ok) {
		const { status, body } = useCaseErrorToHttp(result.error);
		return json(body, { status });
	}

	return json(success(result.value));
};
