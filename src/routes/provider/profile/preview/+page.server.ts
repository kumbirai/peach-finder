import { redirect, type Actions } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { getProfilePreviewForOwner, loadOwnerProfile } from '$lib/server/modules/provider-profile';
import { getAvailabilityStatusForOwner } from '$lib/server/modules/provider-availability';

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
	const now = new Date();
	const [anonymousResult, seekerResult, availabilityResult] = await Promise.all([
		getProfilePreviewForOwner(db, locals.auth.userId!, 'anonymous', ip),
		getProfilePreviewForOwner(db, locals.auth.userId!, 'seeker', ip),
		getAvailabilityStatusForOwner(db, locals.auth.userId!, now)
	]);

	if (!anonymousResult.ok || !seekerResult.ok) {
		redirect(303, '/provider/dashboard');
	}

	return {
		profileId: profile.profileId,
		phoneVisible: profile.phoneVisible,
		availability: availabilityResult.ok
			? availabilityResult.value
			: {
					state: 'not_available' as const,
					setAt: null,
					expiresAt: null,
					expiresInSeconds: null
				},
		anonymousPreview: anonymousResult.value,
		seekerPreview: seekerResult.value
	};
}

export const actions: Actions = {};
