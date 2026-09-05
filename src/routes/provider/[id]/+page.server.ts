import type { Role } from '$lib/server/shared/auth-context';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { gatedActionHref } from '$lib/server/modules/identity-and-access';
import { getPublicProfile, parseProviderProfileId } from '$lib/server/modules/provider-profile';
import { publicAppOrigin } from '$lib/server/env';

export const _requiredRole: Role = 'anonymous';

export async function load({ params, locals, url }) {
	const db = getDb();
	const parsed = parseProviderProfileId(params.id);
	if (!parsed.ok) error(404, 'Profile not found');
	const result = await getPublicProfile(db, parsed.value, locals.auth);
	if (!result.ok) error(404, 'Profile not found');

	const profilePath = `/provider/${params.id}`;
	const origin = publicAppOrigin();

	return {
		profile: result.value,
		providerProfileId: params.id,
		actions: {
			message: gatedActionHref('message', profilePath, params.id, origin),
			review: gatedActionHref('review', profilePath, params.id, origin),
			report: gatedActionHref('report', profilePath, params.id, origin),
			block: gatedActionHref('block', profilePath, params.id, origin)
		},
		og: {
			title: result.value.displayName,
			description: result.value.intro.slice(0, 150),
			image: result.value.photos[0]?.url ? new URL(result.value.photos[0].url, origin).href : null
		},
		canonical: url.href
	};
}
