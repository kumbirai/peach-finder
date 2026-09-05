import type { AuthContext } from '../../../shared/auth-context';
import type { GatedAction } from '../domain/sign-in-intent';
import { gatedActionHref } from './sign-in-url';

export type ProfileActionHrefs = {
	message: string;
	review: string;
	report: string;
	block: string;
};

function hrefForAction(
	action: GatedAction,
	providerProfileId: string,
	profilePath: string,
	viewer: AuthContext,
	origin: string
): string {
	if (action === 'message' && viewer.hasRole('seeker')) {
		return `/messages/compose/${providerProfileId}`;
	}
	return gatedActionHref(action, profilePath, providerProfileId, origin);
}

export function resolveProfileActionHrefs(
	providerProfileId: string,
	profilePath: string,
	viewer: AuthContext,
	origin = ''
): ProfileActionHrefs {
	return {
		message: hrefForAction('message', providerProfileId, profilePath, viewer, origin),
		review: hrefForAction('review', providerProfileId, profilePath, viewer, origin),
		report: hrefForAction('report', providerProfileId, profilePath, viewer, origin),
		block: hrefForAction('block', providerProfileId, profilePath, viewer, origin)
	};
}
