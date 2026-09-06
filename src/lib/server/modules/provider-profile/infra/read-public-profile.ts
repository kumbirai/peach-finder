import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { asId, type ProviderProfileId } from '../../../shared/ids';
import { isDiscoverableListingState } from '../../listing-billing/domain/listing-visibility';
import { getPresence, getResponseTime } from '../../direct-messaging';
import { loadBadgeDisplayState } from '../../trust-and-safety';
import {
	languages,
	providerLanguages,
	providerProfiles,
	providerServiceTags,
	services,
	serviceTags
} from './schema';
import type { ProfileViewRow } from './serializers';

type ListingRow = { state: string };
type RatingRow = { average: string | null; count: number };
type AvailRow = { state: string; setAt: Date | null };
type PhotoRow = { id: string; galleryUrl: string; isPrimary: boolean };

export type LoadProfileViewOptions = {
	/** When false, owner preview can load draft-shaped data regardless of publish/listing state. */
	requirePublished?: boolean;
};

export async function loadProfileView(
	db: Database,
	providerProfileId: ProviderProfileId,
	options: LoadProfileViewOptions = {}
): Promise<ProfileViewRow | null> {
	const requirePublished = options.requirePublished ?? true;
	const profileRows = await db
		.select({
			id: providerProfiles.id,
			ownerId: providerProfiles.ownerId,
			intro: providerProfiles.intro,
			phoneVisible: providerProfiles.phoneVisible,
			publishState: providerProfiles.publishState,
			areaName: sql<string | null>`(
				SELECT a.name FROM platform_configuration.area a
				WHERE a.id = ${providerProfiles.areaId}
			)`,
			areaSlug: sql<string | null>`(
				SELECT a.slug FROM platform_configuration.area a
				WHERE a.id = ${providerProfiles.areaId}
			)`
		})
		.from(providerProfiles)
		.where(eq(providerProfiles.id, providerProfileId))
		.limit(1);

	const profile = profileRows[0];
	if (!profile) return null;

	const listingRows = await db.execute<ListingRow>(sql`
		SELECT state FROM listing_billing.listing
		WHERE provider_profile_id = ${providerProfileId}
		LIMIT 1
	`);
	const listing = (listingRows as unknown as ListingRow[])[0];
	if (
		requirePublished &&
		(profile.publishState !== 'published' || !listing || !isDiscoverableListingState(listing.state))
	) {
		return null;
	}

	const serviceRows = await db
		.select()
		.from(services)
		.where(eq(services.providerProfileId, providerProfileId))
		.orderBy(asc(services.sortOrder));

	const tagRows = await db
		.select({ id: serviceTags.id, name: serviceTags.name })
		.from(providerServiceTags)
		.innerJoin(serviceTags, eq(providerServiceTags.serviceTagId, serviceTags.id))
		.where(eq(providerServiceTags.providerProfileId, providerProfileId));

	const languageRows = await db
		.select({ code: languages.code, name: languages.name })
		.from(providerLanguages)
		.innerJoin(languages, eq(providerLanguages.languageCode, languages.code))
		.where(eq(providerLanguages.providerProfileId, providerProfileId));

	const photoRows = await db.execute<PhotoRow>(sql`
		SELECT pp.id,
			coalesce(
				(select pv.url from media_processing.photo_variant pv
				 where pv.photo_id = pp.photo_id and pv.variant like 'gallery_1280%'
				 limit 1),
				(select pv.url from media_processing.photo_variant pv
				 where pv.photo_id = pp.photo_id and pv.variant like 'card_640%'
				 limit 1),
				'/placeholder-photo.svg'
			) AS "galleryUrl",
			pp.is_primary AS "isPrimary"
		FROM provider_profile.provider_photo pp
		WHERE pp.provider_profile_id = ${providerProfileId}
		  AND pp.status = 'ready'
		ORDER BY pp.sort_order
	`);

	const badgeDisplay = await loadBadgeDisplayState(db, providerProfileId);

	const ratingRows = await db.execute<RatingRow>(sql`
		SELECT average, count FROM provider_reviews.rating_aggregate
		WHERE provider_profile_id = ${providerProfileId}
		LIMIT 1
	`);

	const availRows = await db.execute<AvailRow>(sql`
		SELECT state, set_at AS "setAt" FROM provider_availability.availability_status
		WHERE provider_profile_id = ${providerProfileId}
		LIMIT 1
	`);

	const rating = (ratingRows as unknown as RatingRow[])[0];
	const avail = (availRows as unknown as AvailRow[])[0];
	const liveAvailability = avail?.state === 'available' || avail?.state === 'expiry_warned';
	const now = new Date();
	const ownerId = asId<'UserId'>(profile.ownerId);
	const [responseTime, onlineStatus] = await Promise.all([
		getResponseTime(db, providerProfileId, now),
		getPresence(db, ownerId, now)
	]);

	return {
		id: asId<'ProviderProfileId'>(profile.id),
		ownerId: profile.ownerId,
		intro: profile.intro,
		phoneVisible: profile.phoneVisible,
		publishState: profile.publishState,
		displayName: '',
		areaName: profile.areaName,
		areaSlug: profile.areaSlug,
		services: serviceRows.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description,
			durationMinutes: s.durationMinutes,
			priceCents: s.priceCents
		})),
		tags: tagRows,
		languages: languageRows,
		photos: (photoRows as unknown as PhotoRow[]).map((p) => ({
			id: p.id,
			url: p.galleryUrl,
			isPrimary: p.isPrimary
		})),
		badges: {
			identityVerified: badgeDisplay.identityVerified,
			activeThisWeek: badgeDisplay.activeThisWeek
		},
		ratingAverage: rating?.average ?? null,
		ratingCount: rating?.count ?? 0,
		responseTime,
		onlineStatus,
		availabilityState: liveAvailability ? 'available' : 'not_available',
		availabilitySetAt: avail?.setAt
			? avail.setAt instanceof Date
				? avail.setAt
				: new Date(avail.setAt)
			: null,
		phone: null
	};
}

/** Primary photo card_640 URL for Open Graph link previews (FR-PROF-11). */
export async function loadPrimarySharePhotoUrl(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<string | null> {
	const rows = await db.execute<{ url: string }>(sql`
		SELECT pv.url
		FROM provider_profile.provider_photo pp
		INNER JOIN media_processing.photo_variant pv ON pv.photo_id = pp.photo_id
		WHERE pp.provider_profile_id = ${providerProfileId}
		  AND pp.status = 'ready'
		  AND pp.is_primary = true
		  AND pv.variant LIKE 'card_640%'
		LIMIT 1
	`);
	return (rows as unknown as { url: string }[])[0]?.url ?? null;
}

export async function listPublishedProfileIds(db: Database): Promise<ProviderProfileId[]> {
	const rows = await db.execute<{ id: string }>(sql`
		SELECT p.id
		FROM provider_profile.provider_profile p
		INNER JOIN listing_billing.listing l ON l.provider_profile_id = p.id
		WHERE p.publish_state = 'published'
		  AND l.state IN ('free_listed', 'paid_listed', 'grace')
	`);
	return (rows as unknown as { id: string }[]).map((r) => asId<'ProviderProfileId'>(r.id));
}
