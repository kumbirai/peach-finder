import type { Role } from '$lib/server/shared/auth-context';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { resolveProfileActionHrefs } from '$lib/server/modules/identity-and-access';
import { canSeekerMessageProvider } from '$lib/server/modules/direct-messaging';
import {
	buildShareMetadata,
	getPublicProfile,
	getProfileOwnerIdDb,
	loadPrimarySharePhotoUrl,
	parseProviderProfileId
} from '$lib/server/modules/provider-profile';
import {
	captureView,
	deriveViewerKey,
	ANON_COOKIE
} from '$lib/server/modules/provider-analytics';
import { publicAppOrigin } from '$lib/server/env';

export const _requiredRole: Role = 'anonymous';

export async function load({ params, locals, url, cookies }) {
	const db = getDb();
	const parsed = parseProviderProfileId(params.id);
	if (!parsed.ok) error(404, 'Profile not found');
	const result = await getPublicProfile(db, parsed.value, locals.auth);
	if (!result.ok) error(404, 'Profile not found');

	const ownerId = await getProfileOwnerIdDb(db, parsed.value);
	const isOwnerView = ownerId != null && locals.auth.userId === ownerId;
	if (!isOwnerView) {
		const viewerKey = deriveViewerKey(
			locals.auth,
			cookies.get(ANON_COOKIE),
			new Date()
		);
		void captureView(db, parsed.value, viewerKey);
	}

	const profilePath = `/provider/${params.id}`;
	const origin = publicAppOrigin();
	const sharePhotoUrl = await loadPrimarySharePhotoUrl(db, parsed.value);
	const og = buildShareMetadata(
		result.value.displayName,
		result.value.intro,
		sharePhotoUrl,
		origin
	);

	let showMessage = true;
	if (locals.auth.userId && locals.auth.hasRole('seeker')) {
		showMessage = await canSeekerMessageProvider(db, locals.auth.userId, parsed.value);
	}

	return {
		profile: result.value,
		providerProfileId: params.id,
		shareUrl: new URL(profilePath, origin).href,
		actions: resolveProfileActionHrefs(params.id, profilePath, locals.auth, origin),
		showMessage,
		og,
		canonical: url.href
	};
}
