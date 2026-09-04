import type { SignInIntent } from '../domain/sign-in-intent';

export function buildSignInUrl(intent: SignInIntent, origin = ''): string {
	const params = new URLSearchParams({
		returnTo: intent.returnTo,
		action: intent.action
	});
	if (intent.providerProfileId) {
		params.set('providerProfileId', intent.providerProfileId);
	}
	const base = origin ? `${origin}/sign-in` : '/sign-in';
	return `${base}?${params.toString()}`;
}

export function gatedActionHref(
	action: SignInIntent['action'],
	profilePath: string,
	providerProfileId: string,
	origin = ''
): string {
	return buildSignInUrl(
		{
			returnTo: profilePath,
			action,
			providerProfileId
		},
		origin
	);
}
