import { error } from '@sveltejs/kit';
import type { Role } from '$lib/server/shared/auth-context';
import { getDb } from '$lib/server/db';
import {
	getReviewEligibilityDto,
	parseProviderProfileId
} from '$lib/server/modules/provider-reviews';
import { getPublicProfile } from '$lib/server/modules/provider-profile';

export const _requiredRole: Role = 'seeker';

export async function load({ params, locals }) {
	const parsed = parseProviderProfileId(params.id);
	if (!parsed.ok) error(404, 'Profile not found');

	const db = getDb();
	const profile = await getPublicProfile(db, parsed.value, locals.auth);
	if (!profile.ok) error(404, 'Profile not found');

	const eligibility = await getReviewEligibilityDto(
		db,
		locals.auth.userId!,
		parsed.value,
		new Date()
	);

	return {
		providerProfileId: params.id,
		displayName: profile.value.displayName,
		profilePath: `/provider/${params.id}`,
		eligibility
	};
}
