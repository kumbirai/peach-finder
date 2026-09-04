import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { asId } from '$lib/server/shared/ids';
import {
	bucketSpec,
	consumeOtpRequestRateLimits,
	consumeRateLimit
} from '$lib/server/shared/rate-limit';
import { normalizePhoneE164 } from '$lib/server/modules/identity-and-access/domain/phone-policy';
import { requireActiveRegistrationArea } from '$lib/server/modules/identity-and-access/app/provider-registration-area';
import { listAreas } from '$lib/server/modules/platform-configuration';
import {
	createSession,
	registerProvider,
	setSessionCookie,
	verifyOtp
} from '$lib/server/modules/identity-and-access';
import { createDraftProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'anonymous';

export async function load() {
	const db = getDb();
	const areas = await listAreas(db);
	return {
		areas: areas
			.filter((a) => a.isActive)
			.map((a) => ({ id: a.id, name: a.name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	};
}

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

export const actions: Actions = {
	register: async ({ request }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();

		const areaId = String(data.get('areaId') ?? '');
		const areaResult = await requireActiveRegistrationArea(db, areaId);
		if (!areaResult.ok) {
			if (areaResult.error.kind === 'validation_failed') {
				return fail(422, {
					issues: areaResult.error.issues,
					values: formValues(data)
				});
			}
			return fail(400, { message: 'Registration failed.', values: formValues(data) });
		}

		const phone = String(data.get('phone') ?? '');
		const normalizedPhone = normalizePhoneE164(phone);
		if (normalizedPhone) {
			const limited =
				process.env.ALLOW_DEV_HELPERS === '1'
					? { ok: true as const, value: undefined }
					: await consumeOtpRequestRateLimits(
							db,
							{ phone: normalizedPhone, ip: clientIp(request) },
							now
						);
			if (!limited.ok) {
				return fail(429, { message: 'Too many attempts. Try again in a moment.' });
			}
		}

		const result = await registerProvider(
			db,
			{
				email: String(data.get('email') ?? ''),
				password: String(data.get('password') ?? ''),
				displayName: String(data.get('displayName') ?? ''),
				phone: String(data.get('phone') ?? ''),
				acceptedTerms: data.get('acceptedTerms') === 'on'
			},
			now,
			crypto.randomUUID()
		);

		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues, values: formValues(data) });
			}
			if (result.error.kind === 'conflict') {
				return fail(409, { message: result.error.reason, values: formValues(data) });
			}
			return fail(400, { message: 'Registration failed.', values: formValues(data) });
		}

		if (!result.value.accountCreated) {
			return {
				message:
					'If this email is new, we sent a verification code to your mobile. Check your messages or sign in.',
				values: formValues(data),
				step: 'register' as const
			};
		}

		return {
			step: 'verify' as const,
			otpId: result.value.otpId!,
			userId: result.value.userId!,
			areaId,
			values: formValues(data)
		};
	},

	verify: async ({ request, cookies }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const values = formValues(data);
		const otpId = String(data.get('otpId') ?? '');
		const areaId = String(data.get('areaId') ?? '');

		const areaResult = await requireActiveRegistrationArea(db, areaId);
		if (!areaResult.ok) {
			if (areaResult.error.kind === 'validation_failed') {
				return fail(422, {
					issues: areaResult.error.issues,
					step: 'verify' as const,
					otpId,
					userId: String(data.get('userId') ?? ''),
					areaId,
					values
				});
			}
			return fail(400, {
				message: 'Registration failed.',
				step: 'verify' as const,
				otpId,
				userId: String(data.get('userId') ?? ''),
				areaId,
				values
			});
		}

		const limited = await consumeRateLimit(
			db,
			bucketSpec('otp_verify_attempt'),
			`otp:${otpId}`,
			now
		);
		if (!limited.ok) {
			return fail(429, {
				message: 'Too many attempts. Try again in a moment.',
				step: 'verify' as const,
				otpId,
				userId: String(data.get('userId') ?? ''),
				areaId,
				values
			});
		}

		const verified = await verifyOtp(
			db,
			{ otpId: asId<'OtpId'>(otpId), code: String(data.get('code') ?? '') },
			now,
			crypto.randomUUID()
		);

		if (!verified.ok) {
			if (verified.error.kind === 'validation_failed') {
				return fail(422, {
					issues: verified.error.issues,
					step: 'verify' as const,
					otpId,
					userId: String(data.get('userId') ?? ''),
					areaId,
					values
				});
			}
			if (verified.error.kind === 'precondition_failed') {
				return fail(412, {
					message: verified.error.reason,
					step: 'verify' as const,
					otpId,
					userId: String(data.get('userId') ?? ''),
					areaId,
					values
				});
			}
			return fail(404, {
				message: 'That code has expired. Request a new one.',
				step: 'verify' as const,
				otpId,
				userId: String(data.get('userId') ?? ''),
				areaId,
				values
			});
		}

		const draft = await createDraftProfile(db, verified.value.userId, areaResult.value);
		if (!draft.ok) {
			return fail(500, { message: 'Could not create your profile. Please try again.' });
		}

		const { token } = await createSession(db, {
			userId: verified.value.userId,
			ipAddress: clientIp(request),
			userAgent: request.headers.get('user-agent'),
			now
		});
		setSessionCookie(cookies, token, false);

		redirect(303, '/provider/onboarding');
	}
};

function formValues(data: FormData) {
	return {
		displayName: String(data.get('displayName') ?? ''),
		email: String(data.get('email') ?? ''),
		phone: String(data.get('phone') ?? ''),
		areaId: String(data.get('areaId') ?? '')
	};
}
