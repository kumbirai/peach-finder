import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { AuthContext } from '../../../shared/auth-context';
import { anonymousAuth, createAuthContext } from '../../../shared/auth-context';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getContactPhone, getDisplayIdentity } from '../../identity-and-access';
import { listPublicReviewsForProvider } from '../../provider-reviews';
import { loadProfileView } from './read-public-profile';
import { providerProfiles } from './schema';
import { toPublicProfile, type PublicProfile } from './serializers';

export type PreviewAudience = 'anonymous' | 'seeker';

const PREVIEW_SEEKER_USER_ID = asId<'UserId'>('00000000-0000-7000-8000-000000000099');

function forcedViewerAuth(audience: PreviewAudience, ipAddress: string): AuthContext {
	if (audience === 'anonymous') {
		return anonymousAuth(ipAddress);
	}
	return createAuthContext({
		userId: PREVIEW_SEEKER_USER_ID,
		role: 'seeker',
		sessionId: null,
		ipAddress
	});
}

export async function getProfilePreviewForOwner(
	db: Database,
	ownerId: UserId,
	audience: PreviewAudience,
	ipAddress: string
): Promise<Result<PublicProfile, UseCaseError>> {
	const ownedRows = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, ownerId))
		.limit(1);
	const profileId = ownedRows[0]?.id as ProviderProfileId | undefined;
	if (!profileId) {
		return Err({ kind: 'not_found', resource: 'provider_profile' });
	}

	const view = await loadProfileView(db, profileId, { requirePublished: false });
	if (!view) {
		return Err({ kind: 'not_found', resource: 'provider_profile' });
	}

	const identity = await getDisplayIdentity(db, asId<'UserId'>(view.ownerId));
	const { reviews } = await listPublicReviewsForProvider(db, profileId, { limit: 20 });

	const forcedViewer = forcedViewerAuth(audience, ipAddress);
	const includePhone = view.phoneVisible || forcedViewer.role !== 'anonymous';

	const enriched = {
		...view,
		displayName: identity.isDeleted ? 'Former user' : identity.displayName,
		phone: includePhone ? await getContactPhone(db, asId<'UserId'>(view.ownerId)) : null,
		reviews
	};

	return Ok(toPublicProfile(enriched, forcedViewer));
}
