export type GatedAction = 'message' | 'review' | 'report' | 'block';

export type SignInIntent = {
	returnTo: string;
	action: GatedAction;
	providerProfileId?: string;
};

const ALLOWED_ACTIONS: GatedAction[] = ['message', 'review', 'report', 'block'];

export function parseGatedAction(raw: string | null | undefined): GatedAction | null {
	if (!raw) return null;
	return ALLOWED_ACTIONS.includes(raw as GatedAction) ? (raw as GatedAction) : null;
}

export function buildSignInIntent(input: {
	returnTo: string;
	action: GatedAction;
	providerProfileId?: string;
}): SignInIntent {
	const intent: SignInIntent = {
		returnTo: input.returnTo,
		action: input.action
	};
	if (input.providerProfileId) intent.providerProfileId = input.providerProfileId;
	return intent;
}
