import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { asId, type ProviderProfileId } from '../../../shared/ids';
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
type ReviewRow = {
	id: string;
	rating: number;
	body: string;
	reviewerId: string;
	createdAt: Date;
};
type PhotoRow = { id: string; galleryUrl: string; isPrimary: boolean };

export async function loadProfileView(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<ProfileViewRow | null> {
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
	if (profile.publishState !== 'published' || listing?.state !== 'free_listed') {
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
		SELECT state, set_at AS "setAt" FROM provider_availability.availability
		WHERE provider_profile_id = ${providerProfileId}
		LIMIT 1
	`);

	const reviewRows = await db.execute<ReviewRow>(sql`
		SELECT id, rating, body, reviewer_id AS "reviewerId", created_at AS "createdAt"
		FROM provider_reviews.review
		WHERE provider_profile_id = ${providerProfileId}
		ORDER BY created_at DESC
		LIMIT 10
	`);

	const rating = (ratingRows as unknown as RatingRow[])[0];
	const avail = (availRows as unknown as AvailRow[])[0];

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
		responseTime: 'within_30_min',
		onlineStatus: avail?.state === 'available' ? 'online' : 'today',
		availabilityState: avail?.state === 'available' ? 'available' : 'not_available',
		availabilitySetAt: avail?.setAt
			? avail.setAt instanceof Date
				? avail.setAt
				: new Date(avail.setAt)
			: null,
		phone: null,
		reviews: (reviewRows as unknown as ReviewRow[]).map((r) => ({
			id: r.id,
			rating: r.rating,
			body: r.body,
			reviewerId: r.reviewerId,
			reviewerName: '',
			createdAt:
				r.createdAt instanceof Date
					? r.createdAt.toISOString()
					: new Date(r.createdAt).toISOString()
		}))
	};
}

export async function listPublishedProfileIds(db: Database): Promise<ProviderProfileId[]> {
	const rows = await db.execute<{ id: string }>(sql`
		SELECT p.id
		FROM provider_profile.provider_profile p
		INNER JOIN listing_billing.listing l ON l.provider_profile_id = p.id
		WHERE p.publish_state = 'published' AND l.state = 'free_listed'
	`);
	return (rows as unknown as { id: string }[]).map((r) => asId<'ProviderProfileId'>(r.id));
}
