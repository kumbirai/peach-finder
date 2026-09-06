import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId, type ProviderProfileId } from '$lib/server/shared/ids';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { useCaseErrorToHttp } from '$lib/server/shared/api';
import { getOwnedProfileIdDb } from '$lib/server/modules/provider-profile';
import { captureTapToCall } from '$lib/server/modules/provider-analytics';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	providerProfileId: z.string().uuid()
});

/** Fire-and-forget tap-to-call capture (202). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const db = getDb();
	const now = new Date();
	const limited = await consumeRateLimit(
		db,
		bucketSpec('analytics_tap'),
		`ip:${locals.auth.ipAddress}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const body = BodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'providerProfileId', message: 'A valid provider id is required.' }]
				}
			},
			{ status: 422 }
		);
	}

	let providerProfileId: ProviderProfileId;
	try {
		providerProfileId = asId<'ProviderProfileId'>(body.data.providerProfileId);
	} catch {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: [{ path: 'providerProfileId', message: 'A valid provider id is required.' }]
				}
			},
			{ status: 422 }
		);
	}

	const ownerProfileId = locals.auth.userId
		? await getOwnedProfileIdDb(db, locals.auth.userId)
		: null;
	if (ownerProfileId === providerProfileId) {
		return new Response(null, { status: 202 });
	}

	void captureTapToCall(db, providerProfileId, now);

	return new Response(null, { status: 202 });
};
