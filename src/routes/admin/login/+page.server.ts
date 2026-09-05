import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import {
	ADMIN_IDLE_MS,
	clearAdminLoginChallenge,
	completeAdminLogin,
	issueAdminLoginChallenge,
	readAdminLoginChallenge,
	setSessionCookie,
	verifyAdminPassword
} from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export function load({ locals, url }) {
	if (locals.auth.role === 'admin') {
		redirect(303, url.searchParams.get('returnTo') ?? '/admin');
	}
	return {
		returnTo: url.searchParams.get('returnTo') ?? '/admin'
	};
}

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

export const actions: Actions = {
	password: async ({ request, cookies, url }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const returnTo = String(data.get('returnTo') ?? '/admin');

		const limited =
			process.env.ALLOW_DEV_HELPERS === '1'
				? { ok: true as const, value: undefined }
				: await consumeRateLimit(db, bucketSpec('auth_login'), `ip:${clientIp(request)}`, now);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const result = await verifyAdminPassword(db, {
			email: String(data.get('email') ?? ''),
			password: String(data.get('password') ?? '')
		});

		if (!result.ok) {
			return fail(403, { message: 'Invalid email or password.' });
		}

		const secure = url.protocol === 'https:';
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
				secure
			);
			return {
				step: 'enroll' as const,
				returnTo,
				otpauthUrl: result.value.enrollment.otpauthUrl,
				secretBase32: result.value.enrollment.secretBase32,
				backupCodes: result.value.enrollment.backupCodes
			};
		}

		issueAdminLoginChallenge(
			cookies,
			{
				userId: result.value.userId,
				email: result.value.email,
				purpose: 'verify'
			},
			now,
			secure
		);
		return { step: 'totp' as const, returnTo };
	},

	totp: async ({ request, cookies, url }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const returnTo = String(data.get('returnTo') ?? '/admin');
		const challenge = readAdminLoginChallenge(cookies, now);
		if (!challenge) {
			return fail(403, { message: 'Your login session expired. Start again.' });
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
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const code = String(data.get('totpCode') ?? data.get('backupCode') ?? '').trim();
		if (!code) {
			return fail(422, { message: 'Enter your authenticator code or a backup code.' });
		}

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
			return fail(403, { message: 'Invalid authenticator or backup code.' });
		}

		clearAdminLoginChallenge(cookies);
		setSessionCookie(cookies, result.value.token, url.protocol === 'https:', ADMIN_IDLE_MS, {
			dbIdleOnly: true
		});
		redirect(303, returnTo);
	}
};
