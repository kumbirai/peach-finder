import { eq } from 'drizzle-orm';
import type { Database } from '../../db';
import { getDb } from '../../db';
import type { AuthContext } from '../../shared/auth-context';
import { asId, InvalidIdError, type ProviderProfileId, type UserId } from '../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../shared/result';
import { getContactPhone, getDisplayIdentity } from '../identity-and-access';
import { providerProfiles } from './infra/schema';
import {
	loadProfileView,
	listPublishedProfileIds as listPublishedIds
} from './infra/read-public-profile';
import { toPublicProfile, type PublicProfile } from './infra/serializers';

export function parseProviderProfileId(raw: string): Result<ProviderProfileId, UseCaseError> {
	try {
		return Ok(asId<'ProviderProfileId'>(raw));
	} catch (error) {
		if (error instanceof InvalidIdError) {
			return Err({ kind: 'not_found', resource: 'provider_profile' });
		}
		throw error;
	}
}

export async function ownsProfile(userId: UserId): Promise<boolean> {
	return ownsProfileDb(getDb(), userId);
}

export async function ownsProfileDb(db: Database, userId: UserId): Promise<boolean> {
	const rows = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, userId))
		.limit(1);
	return rows.length > 0;
}

export async function getOwnedProfileId(userId: UserId): Promise<ProviderProfileId | null> {
	return getOwnedProfileIdDb(getDb(), userId);
}

export async function getOwnedProfileIdDb(
	db: Database,
	userId: UserId
): Promise<ProviderProfileId | null> {
	const rows = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, userId))
		.limit(1);
	return rows[0] ? (rows[0].id as ProviderProfileId) : null;
}

export async function getProfileOwnerDisplayName(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<string> {
	const rows = await db
		.select({ ownerId: providerProfiles.ownerId })
		.from(providerProfiles)
		.where(eq(providerProfiles.id, providerProfileId))
		.limit(1);
	const ownerId = rows[0]?.ownerId;
	if (!ownerId) return 'Therapist';
	const identity = await getDisplayIdentity(db, asId<'UserId'>(ownerId));
	return identity.isDeleted ? 'Former user' : identity.displayName;
}

export async function getOwnedProfileDashboard(
	db: Database,
	userId: UserId
): Promise<{ profileId: ProviderProfileId; displayName: string } | null> {
	const rows = await db
		.select({ id: providerProfiles.id })
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, userId))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	const identity = await getDisplayIdentity(db, userId);
	return {
		profileId: row.id as ProviderProfileId,
		displayName: identity.displayName
	};
}

export async function getPublicProfile(
	db: Database,
	providerProfileId: ProviderProfileId,
	viewer: AuthContext
): Promise<Result<PublicProfile, UseCaseError>> {
	const view = await loadProfileView(db, providerProfileId);
	if (!view) return Err({ kind: 'not_found', resource: 'provider_profile' });

	const identity = await getDisplayIdentity(db, asId<'UserId'>(view.ownerId));

	const reviewerIds = [...new Set(view.reviews.map((r) => r.reviewerId))];
	const reviewerNames = new Map<string, string>();
	for (const reviewerId of reviewerIds) {
		const who = await getDisplayIdentity(db, asId<'UserId'>(reviewerId));
		reviewerNames.set(reviewerId, who.isDeleted ? 'Former user' : who.displayName);
	}
	const enriched = {
		...view,
		displayName: identity.isDeleted ? 'Former user' : identity.displayName,
		phone: await getContactPhone(db, asId<'UserId'>(view.ownerId)),
		reviews: view.reviews.map((r) => ({
			...r,
			reviewerName: reviewerNames.get(r.reviewerId) ?? 'Former user'
		}))
	};

	return Ok(toPublicProfile(enriched, viewer));
}

export async function listPublishedProfileIds(db: Database): Promise<ProviderProfileId[]> {
	return listPublishedIds(db);
}

export {
	unpublishProfileForOwner,
	unpublishProfileForOwnerDb,
	type UnpublishReason
} from './infra/unpublish-profile';
export { publishProfileForOwner } from './infra/publish-profile';
export { createDraftProfile } from './infra/create-draft-profile';
export { loadOwnerProfile, type OwnerProfileDto } from './infra/read-owner-profile';
export {
	updateIntro,
	updateArea,
	addService,
	setLanguages,
	setServiceTags,
	updatePhoneVisibility,
	attachOnboardingPhoto,
	listActiveLanguages,
	listActiveServiceTags
} from './infra/profile-commands';
export { getGalleryReadyCount, getGalleryTotalCount } from './infra/gallery-count';
export {
	attachProfilePhoto,
	reorderProfilePhotos,
	setPrimaryProfilePhoto,
	deleteProfilePhoto
} from './infra/photo-commands';
export { proposeServiceTag } from './infra/tag-proposal-commands';
export { handleMediaProcessed, handleMediaRemoved } from './infra/subscriptions';
export { getProfilePreviewForOwner, type PreviewAudience } from './infra/preview-profile';
export { formatMissingFields, MISSING_FIELD_LABELS } from './domain/missing-field-labels';
export { INTRO_MAX_LENGTH, validateIntro } from './domain/intro-policy';
export {
	ONBOARDING_STEPS,
	type OnboardingStep,
	type MissingField
} from './domain/publish-readiness';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
