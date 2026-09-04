import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId } from '$lib/server/shared/ids';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { verifyOtp } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	otpId: z.string().uuid(),
	code: z.string().length(6)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const db = getDb();
	const now = new Date();
	const body = BodySchema.safeParse(await request.json());
	if (!body.success) {
		return json(
			{
				error: {
					code: 'VALIDATION_FAILED',
					message: 'Please fix the highlighted fields.',
					fields: body.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			},
			{ status: 422 }
		);
	}

	const limited = await consumeRateLimit(
		db,
		bucketSpec('otp_verify_attempt'),
		`otp:${body.data.otpId}`,
		now
	);
	if (!limited.ok) {
		const mapped = useCaseErrorToHttp(limited.error);
		return json(mapped.body, { status: mapped.status });
	}

	const result = await verifyOtp(
		db,
		{ otpId: asId(body.data.otpId), code: body.data.code },
		now,
		locals.correlationId
	);

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
