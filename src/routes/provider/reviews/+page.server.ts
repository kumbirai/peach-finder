import { redirect } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import { listPublicReviewsForProvider } from '$lib/server/modules/provider-reviews';
import { loadOwnerProfile } from '$lib/server/modules/provider-profile';
import { asId } from '$lib/server/shared/ids';

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

	const profileId = asId<'ProviderProfileId'>(profile.profileId);
	const { reviews } = await listPublicReviewsForProvider(db, profileId, { limit: 50 });

	return {
		profileId: profile.profileId,
		reviews
	};
}
