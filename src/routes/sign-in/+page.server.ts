import { fail, redirect, type Actions, type Cookies } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import type { UserId } from '$lib/server/shared/ids';
import { getDb } from '$lib/server/db';
import { bucketSpec, consumeRateLimit } from '$lib/server/shared/rate-limit';
import {
	buildPostAuthRedirect,
	createSession,
	loginPassword,
	parseGatedAction,
	registerSeeker,
	setSessionCookie
} from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export function load({ url }) {
	const returnTo = url.searchParams.get('returnTo') ?? '/';
	const action = parseGatedAction(url.searchParams.get('action'));
	const providerProfileId = url.searchParams.get('providerProfileId');
	const flow = url.searchParams.get('flow');

	return {
		returnTo,
		action,
		providerProfileId,
		messageDraft: url.searchParams.get('draft') ?? '',
		initialMode: flow === 'sign-in' ? ('sign-in' as const) : ('sign-up' as const)
	};
}

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '127.0.0.1';
}

function setSessionCookieOnRequest(cookies: Cookies, token: string): void {
	setSessionCookie(cookies, token, false);
}

async function finishAuth(input: {
	cookies: Cookies;
	request: Request;
	userId: UserId;
	returnTo: string;
	action: ReturnType<typeof parseGatedAction>;
	providerProfileId: string | null;
	messageDraft: string | null;
}): Promise<never> {
	const db = getDb();
	const now = new Date();
	const { token } = await createSession(db, {
		userId: input.userId,
		ipAddress: clientIp(input.request),
		userAgent: input.request.headers.get('user-agent'),
		now
	});
	setSessionCookieOnRequest(input.cookies, token);
	const redirectTo = buildPostAuthRedirect({
		returnTo: input.returnTo,
		action: input.action,
		providerProfileId: input.providerProfileId,
		messageDraft: input.messageDraft
	});
	redirect(303, redirectTo);
}

export const actions: Actions = {
	register: async ({ request, cookies }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const returnTo = String(data.get('returnTo') ?? '/');
		const action = parseGatedAction(String(data.get('action') ?? ''));
		const providerProfileId = data.get('providerProfileId')
			? String(data.get('providerProfileId'))
			: null;
		const messageDraft = String(data.get('messageDraft') ?? '').trim() || null;

		const limited =
			process.env.ALLOW_DEV_HELPERS === '1'
				? { ok: true as const, value: undefined }
				: await consumeRateLimit(db, bucketSpec('register'), `ip:${clientIp(request)}`, now);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const result = await registerSeeker(
			db,
			{
				email: String(data.get('email') ?? ''),
				password: String(data.get('password') ?? ''),
				displayName: String(data.get('displayName') ?? ''),
				acceptedTerms: data.get('acceptedTerms') === 'on'
			},
			now,
			crypto.randomUUID()
		);

		if (!result.ok) {
			if (result.error.kind === 'validation_failed') {
				return fail(422, { issues: result.error.issues });
			}
			return fail(400, { message: 'Registration failed.' });
		}

		if (!result.value.accountCreated) {
			const params = new URLSearchParams({ returnTo });
			if (action) params.set('action', action);
			if (providerProfileId) params.set('providerProfileId', providerProfileId);
			if (messageDraft) params.set('draft', messageDraft);
			redirect(303, `/sign-in?${params.toString()}`);
		}

		await finishAuth({
			cookies,
			request,
			userId: result.value.userId!,
			returnTo,
			action,
			providerProfileId,
			messageDraft
		});
	},

	login: async ({ request, cookies }) => {
		const db = getDb();
		const now = new Date();
		const data = await request.formData();
		const returnTo = String(data.get('returnTo') ?? '/');
		const action = parseGatedAction(String(data.get('action') ?? ''));
		const providerProfileId = data.get('providerProfileId')
			? String(data.get('providerProfileId'))
			: null;
		const messageDraft = String(data.get('messageDraft') ?? '').trim() || null;

		const limited = await consumeRateLimit(
			db,
			bucketSpec('auth_login'),
			`ip:${clientIp(request)}`,
			now
		);
		if (!limited.ok) {
			return fail(429, { message: 'Too many attempts. Try again in a moment.' });
		}

		const result = await loginPassword(db, {
			email: String(data.get('email') ?? ''),
			password: String(data.get('password') ?? '')
		});

		if (!result.ok) {
			return fail(403, { message: 'Invalid email or password.' });
		}

		await finishAuth({
			cookies,
			request,
			userId: result.value.userId,
			returnTo,
			action,
			providerProfileId,
			messageDraft
		});
	}
};
