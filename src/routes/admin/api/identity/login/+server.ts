import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import {
	issueAdminLoginChallenge,
	verifyAdminPassword
} from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

const bodySchema = z.object({
	email: z.string().min(1),
	password: z.string().min(1)
});

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const db = getDb();
	const now = new Date();
	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
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

	const limited =
		process.env.ALLOW_DEV_HELPERS === '1'
			? { ok: true as const, value: undefined }
			: await consumeRateLimit(db, bucketSpec('auth_login'), `ip:${clientIp(request)}`, now);
	if (!limited.ok) {
		return json(useCaseErrorToHttp({ kind: 'rate_limited', retryAfterSeconds: 60 }).body, {
			status: 429
		});
	}

	const result = await verifyAdminPassword(db, parsed.data);
	if (!result.ok) {
		return json(useCaseErrorToHttp(result.error).body, { status: 403 });
	}

	if (result.value.needsEnrollment && result.value.enrollment) {
		issueAdminLoginChallenge(
			cookies,
			{
				userId: result.value.userId,
				email: result.value.email,
				purpose: 'enroll',
				pendingSecretBase64: result.value.enrollment.secret.toString('base64'),
				backupCodes: result.value.enrollment.backupCodes
			},
			now,
			url.protocol === 'https:'
		);
		return json(
			success({
				step: 'enroll' as const,
				userId: result.value.userId,
				otpauthUrl: result.value.enrollment.otpauthUrl,
				secretBase32: result.value.enrollment.secretBase32,
				backupCodes: result.value.enrollment.backupCodes
			})
		);
	}

	issueAdminLoginChallenge(
		cookies,
		{
			userId: result.value.userId,
			email: result.value.email,
			purpose: 'verify'
		},
		now,
		url.protocol === 'https:'
	);

	const payload: {
		step: 'totp';
		userId: string;
		devTotpCode?: string;
	} = {
		step: 'totp',
		userId: result.value.userId
	};
	if (process.env.ALLOW_DEV_HELPERS === '1') {
		const { loadAdminTotpSecret, generateTotpCode } =
			await import('$lib/server/modules/identity-and-access');
		const secret = await loadAdminTotpSecret(db, result.value.userId);
		if (secret) payload.devTotpCode = generateTotpCode(secret, now);
	}
	return json(success(payload));
};
