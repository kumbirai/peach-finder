import type { GatedAction } from './sign-in-intent';

export function buildPostAuthRedirect(input: {
	returnTo: string;
	action: GatedAction | null;
	providerProfileId: string | null;
	messageDraft?: string | null;
}): string {
	if (input.action === 'message' && input.providerProfileId) {
		const base = `/messages/compose/${input.providerProfileId}`;
		if (input.messageDraft?.trim()) {
			return `${base}?draft=${encodeURIComponent(input.messageDraft.trim())}`;
		}
		return base;
	}
	if (input.action === 'report' && input.providerProfileId) {
		return `/provider/${input.providerProfileId}/report`;
	}
	if (input.action === 'review' && input.providerProfileId) {
		return `/provider/${input.providerProfileId}/review`;
	}
	if (input.returnTo.startsWith('/')) {
		return input.returnTo;
	}
	return '/';
}
