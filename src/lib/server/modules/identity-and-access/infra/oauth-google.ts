import { createHash, randomBytes } from 'node:crypto';
import { publicAppOrigin } from '../../../env';

const OAUTH_STATE_COOKIE = 'pf_oauth_state';
const OAUTH_PKCE_COOKIE = 'pf_oauth_pkce';

export function oauthStateCookieName(): string {
	return OAUTH_STATE_COOKIE;
}

export function oauthPkceCookieName(): string {
	return OAUTH_PKCE_COOKIE;
}

export function googleClientId(): string | undefined {
	return process.env.GOOGLE_CLIENT_ID;
}

export function googleClientSecret(): string | undefined {
	return process.env.GOOGLE_CLIENT_SECRET;
}

export function isGoogleOAuthConfigured(): boolean {
	return Boolean(googleClientId() && googleClientSecret());
}

export function buildGoogleAuthUrl(input: {
	state: string;
	codeChallenge: string;
	redirectUri: string;
}): string {
	const params = new URLSearchParams({
		client_id: googleClientId()!,
		redirect_uri: input.redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state: input.state,
		code_challenge: input.codeChallenge,
		code_challenge_method: 'S256',
		access_type: 'online',
		prompt: 'select_account'
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleRedirectUri(): string {
	return `${publicAppOrigin()}/api/identity/oauth/google/callback`;
}

export function newOAuthState(): string {
	return randomBytes(24).toString('hex');
}

export function newPkceVerifier(): string {
	return randomBytes(32).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

export type GoogleTokenResponse = {
	access_token: string;
	id_token: string;
	token_type: string;
};

export type GoogleUserInfo = {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
};

export async function exchangeGoogleCode(
	code: string,
	verifier: string
): Promise<GoogleTokenResponse> {
	const body = new URLSearchParams({
		client_id: googleClientId()!,
		client_secret: googleClientSecret()!,
		code,
		grant_type: 'authorization_code',
		redirect_uri: googleRedirectUri(),
		code_verifier: verifier
	});
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) throw new Error('google token exchange failed');
	return (await res.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
	const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error('google userinfo failed');
	return (await res.json()) as GoogleUserInfo;
}
