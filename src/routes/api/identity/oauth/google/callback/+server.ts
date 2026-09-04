import { redirect, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	buildPostAuthRedirect,
	createSession,
	findOAuthLink,
	createOAuthUser,
	SESSION_COOKIE,
	SEEKER_IDLE_MS,
	parseGatedAction,
	oauthPkceCookieName,
	oauthStateCookieName,
	exchangeGoogleCode,
	fetchGoogleUserInfo
} from '$lib/server/modules/identity-and-access';
import type { UserId } from '$lib/server/shared/ids';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ url, cookies, request, getClientAddress }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const stored = cookies.get(oauthStateCookieName());
	const verifier = cookies.get(oauthPkceCookieName());

	if (!code || !state || !stored || !verifier) {
		return new Response('Invalid OAuth callback', { status: 400 });
	}

	let parsed: {
		state: string;
		returnTo: string;
		action: string;
		providerProfileId: string;
		messageDraft?: string;
	};
	try {
		parsed = JSON.parse(stored) as typeof parsed;
	} catch {
		return new Response('Invalid OAuth state', { status: 400 });
	}

	if (parsed.state !== state) {
		return new Response('OAuth state mismatch', { status: 400 });
	}

	cookies.delete(oauthStateCookieName(), { path: '/' });
	cookies.delete(oauthPkceCookieName(), { path: '/' });

	const db = getDb();
	const now = new Date();
	let userId: UserId;

	try {
		const tokens = await exchangeGoogleCode(code, verifier);
		const profile = await fetchGoogleUserInfo(tokens.access_token);
		const link = await findOAuthLink(db, 'google', profile.sub);
		if (link) {
			userId = link.userId;
		} else {
			userId = await db.transaction(async (tx) =>
				createOAuthUser(
					tx,
					{
						provider: 'google',
						subject: profile.sub,
						email: profile.email,
						emailVerified: profile.email_verified,
						displayName: profile.name || profile.email.split('@')[0] || 'User'
					},
					now,
					crypto.randomUUID()
				)
			);
		}
	} catch {
		return new Response('OAuth provider unavailable', { status: 503 });
	}

	const { token } = await createSession(db, {
		userId,
		ipAddress: getClientAddress(),
		userAgent: request.headers.get('user-agent'),
		now
	});

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: SEEKER_IDLE_MS / 1000,
		secure: false
	});

	const redirectTo = buildPostAuthRedirect({
		returnTo: parsed.returnTo,
		action: parseGatedAction(parsed.action || null),
		providerProfileId: parsed.providerProfileId || null,
		messageDraft: parsed.messageDraft?.trim() || null
	});
	redirect(303, redirectTo);
};
