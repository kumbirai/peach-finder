import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId } from '$lib/server/shared/ids';
import { consumeOtpRequestRateLimits } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import { normalizePhoneE164 } from '$lib/server/modules/identity-and-access/domain/phone-policy';
import { requestOtp } from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

const BodySchema = z.object({
	userId: z.string().uuid(),
	phone: z.string().min(1)
});

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

export const POST: RequestHandler = async ({ request }) => {
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

	const normalizedPhone = normalizePhoneE164(body.data.phone);
	if (normalizedPhone && process.env.ALLOW_DEV_HELPERS !== '1') {
		const limited = await consumeOtpRequestRateLimits(
			db,
			{ phone: normalizedPhone, ip: clientIp(request) },
			now
		);
		if (!limited.ok) {
			const mapped = useCaseErrorToHttp(limited.error);
			return json(mapped.body, { status: mapped.status });
		}
	}

	const result = await requestOtp(
		db,
		{
			userId: asId(body.data.userId),
			phone: body.data.phone,
			purpose: 'register'
		},
		now
	);

	if (!result.ok) {
		const mapped = useCaseErrorToHttp(result.error);
		return json(mapped.body, { status: mapped.status });
	}

	return json(success(result.value));
};
