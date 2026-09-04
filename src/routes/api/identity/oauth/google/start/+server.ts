import { redirect, type RequestHandler } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import {
	buildGoogleAuthUrl,
	googleRedirectUri,
	isGoogleOAuthConfigured,
	newOAuthState,
	newPkceVerifier,
	oauthPkceCookieName,
	oauthStateCookieName,
	pkceChallenge
} from '$lib/server/modules/identity-and-access';

export const _requiredRole: Role = 'anonymous';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!isGoogleOAuthConfigured()) {
		return new Response('Google OAuth is not configured', { status: 503 });
	}

	const state = newOAuthState();
	const verifier = newPkceVerifier();
	const challenge = pkceChallenge(verifier);

	const returnTo = url.searchParams.get('returnTo') ?? '/';
	const action = url.searchParams.get('action') ?? '';
	const providerProfileId = url.searchParams.get('providerProfileId') ?? '';
	const messageDraft = url.searchParams.get('draft') ?? '';

	const payload = JSON.stringify({ state, returnTo, action, providerProfileId, messageDraft });
	cookies.set(oauthStateCookieName(), payload, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600,
		secure: false
	});
	cookies.set(oauthPkceCookieName(), verifier, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600,
		secure: false
	});

	const authUrl = buildGoogleAuthUrl({
		state,
		codeChallenge: challenge,
		redirectUri: googleRedirectUri()
	});
	redirect(302, authUrl);
};
