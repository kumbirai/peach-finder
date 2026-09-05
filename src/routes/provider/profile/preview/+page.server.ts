import { redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getProfilePreviewForOwner, loadOwnerProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'provider';

export async function load({ locals }) {
	const db = getDb();
	const profile = await loadOwnerProfile(db, locals.auth.userId!);
	if (!profile) {
		redirect(303, '/provider/register');
	}
	if (profile.publishState === 'draft') {
		redirect(303, '/provider/onboarding');
	}

	const ip = locals.auth.ipAddress;
	const [anonymousResult, seekerResult] = await Promise.all([
		getProfilePreviewForOwner(db, locals.auth.userId!, 'anonymous', ip),
		getProfilePreviewForOwner(db, locals.auth.userId!, 'seeker', ip)
	]);

	if (!anonymousResult.ok || !seekerResult.ok) {
		redirect(303, '/provider/dashboard');
	}

	return {
		profileId: profile.profileId,
		phoneVisible: profile.phoneVisible,
		anonymousPreview: anonymousResult.value,
		seekerPreview: seekerResult.value
	};
}

export const actions: Actions = {};
