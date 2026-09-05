import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import { success, useCaseErrorToHttp } from '$lib/server/shared/api';
import {
	ADMIN_IDLE_MS,
	clearAdminLoginChallenge,
	completeAdminLogin,
	readAdminLoginChallenge,
	setSessionCookie
} from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

const bodySchema = z
	.object({
		totpCode: z.string().optional(),
		backupCode: z.string().optional()
	})
	.refine((value) => Boolean(value.totpCode?.trim() || value.backupCode?.trim()), {
		message: 'Enter your authenticator code or a backup code.'
	});

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const db = getDb();
	const now = new Date();
	const challenge = readAdminLoginChallenge(cookies, now);
	if (!challenge) {
		return json(useCaseErrorToHttp({ kind: 'forbidden', reason: 'login expired' }).body, {
			status: 403
		});
	}

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
			: await consumeRateLimit(
					db,
					bucketSpec('admin_totp_verify'),
					`admin:${challenge.userId}`,
					now
				);
	if (!limited.ok) {
		return json(useCaseErrorToHttp({ kind: 'rate_limited', retryAfterSeconds: 60 }).body, {
			status: 429
		});
	}

	const code = parsed.data.totpCode?.trim() || parsed.data.backupCode!.trim();
	const enrollment =
		challenge.purpose === 'enroll' && challenge.pendingSecretBase64
			? {
					secret: Buffer.from(challenge.pendingSecretBase64, 'base64'),
					backupCodes: challenge.backupCodes ?? []
				}
			: undefined;

	const loginInput = {
		userId: challenge.userId,
		code,
		ipAddress: clientIp(request),
		userAgent: request.headers.get('user-agent'),
		now
	};

	const result = await completeAdminLogin(
		db,
		enrollment ? { ...loginInput, enrollment } : loginInput
	);

	if (!result.ok) {
		return json(useCaseErrorToHttp(result.error).body, { status: 403 });
	}

	clearAdminLoginChallenge(cookies);
	setSessionCookie(cookies, result.value.token, url.protocol === 'https:', ADMIN_IDLE_MS, {
		dbIdleOnly: true
	});
	return json(success({ userId: result.value.userId, enrolled: result.value.enrolled }));
};
