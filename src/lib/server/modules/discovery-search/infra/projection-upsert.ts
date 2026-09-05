import { sql } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import { getDisplayIdentity } from '../../identity-and-access';
import { asId, type ProviderProfileId } from '../../../shared/ids';
import { searchProjection } from './schema';

type ProjectionSource = {
	providerProfileId: string;
	ownerId: string;
	areaId: string;
	searchText: string;
	displayName: string;
	serviceTagIds: string[];
	languageCodes: string[];
	priceMinCents: number | null;
	priceMaxCents: number | null;
	photoPrimaryUrl: string | null;
	publishedAt: Date;
};

export async function upsertSearchProjection(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	publishedAt: Date
): Promise<void> {
	const source = await loadProjectionSource(tx, providerProfileId, publishedAt);
	if (!source) return;

	await tx
		.insert(searchProjection)
		.values({
			providerProfileId: source.providerProfileId,
			ownerId: source.ownerId,
			displayName: source.displayName,
			searchText: source.searchText,
			serviceTagIds: source.serviceTagIds,
			languageCodes: source.languageCodes,
			areaId: source.areaId,
			priceMinCents: source.priceMinCents,
			priceMaxCents: source.priceMaxCents,
			availabilityState: 'not_available',
			availabilitySetAt: null,
			ratingAverage: null,
			ratingCount: 0,
			badgeIdentityVerified: false,
			badgeActiveThisWeek: false,
			isFeatured: false,
			featuredSince: null,
			lastActivityAt: publishedAt,
			photoPrimaryUrl: source.photoPrimaryUrl,
			publishedAt: source.publishedAt,
			updatedAt: publishedAt
		})
		.onConflictDoUpdate({
			target: searchProjection.providerProfileId,
			set: {
				ownerId: source.ownerId,
				displayName: source.displayName,
				searchText: source.searchText,
				serviceTagIds: source.serviceTagIds,
				languageCodes: source.languageCodes,
				areaId: source.areaId,
				priceMinCents: source.priceMinCents,
				priceMaxCents: source.priceMaxCents,
				photoPrimaryUrl: source.photoPrimaryUrl,
				publishedAt: source.publishedAt,
				updatedAt: publishedAt
			}
		});
}

async function loadProjectionSource(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	publishedAt: Date
): Promise<ProjectionSource | null> {
	const profileRows = await tx.execute<{
		owner_id: string;
		area_id: string;
		intro: string | null;
	}>(sql`
		select owner_id, area_id, intro
		from provider_profile.provider_profile
		where id = ${providerProfileId}::uuid
		  and publish_state = 'published'
		  and area_id is not null
		limit 1
	`);
	const profile = (
		profileRows as unknown as Array<{
			owner_id: string;
			area_id: string;
			intro: string | null;
		}>
	)[0];
	if (!profile?.area_id) return null;

	const identity = await getDisplayIdentity(tx, asId<'UserId'>(profile.owner_id));

	const tagRows = await tx.execute<{ id: string }>(sql`
		select st.id
		from provider_profile.provider_service_tag pst
		inner join provider_profile.service_tag st on st.id = pst.service_tag_id
		where pst.provider_profile_id = ${providerProfileId}::uuid
	`);
	const languageRows = await tx.execute<{ code: string }>(sql`
		select language_code as code
		from provider_profile.provider_language
		where provider_profile_id = ${providerProfileId}::uuid
	`);
	const priceRows = await tx.execute<{ min_cents: number | null; max_cents: number | null }>(sql`
		select min(price_cents)::int as min_cents, max(price_cents)::int as max_cents
		from provider_profile.service
		where provider_profile_id = ${providerProfileId}::uuid
	`);
	const photoRows = await tx.execute<{ url: string }>(sql`
		select coalesce(
			(select pv.url from media_processing.photo_variant pv
			 where pv.photo_id = pp.photo_id and pv.variant like 'card_640%'
			 limit 1),
			'/placeholder-photo.svg'
		) as url
		from provider_profile.provider_photo pp
		where pp.provider_profile_id = ${providerProfileId}::uuid
		  and pp.status = 'ready'
		  and pp.is_primary = true
		limit 1
	`);
	const serviceNameRows = await tx.execute<{ name: string }>(sql`
		select name from provider_profile.service
		where provider_profile_id = ${providerProfileId}::uuid
		order by sort_order
	`);

	const prices = (
		priceRows as unknown as Array<{
			min_cents: number | null;
			max_cents: number | null;
		}>
	)[0];
	const photo = (photoRows as unknown as Array<{ url: string }>)[0];
	const serviceNames = (serviceNameRows as unknown as Array<{ name: string }>)
		.map((row) => row.name)
		.join(' ');
	const intro = profile.intro?.trim() ?? '';
	const searchText = [intro, serviceNames].filter(Boolean).join(' ').trim() || intro;

	return {
		providerProfileId,
		ownerId: profile.owner_id,
		areaId: profile.area_id,
		searchText,
		displayName: identity.isDeleted ? 'Former user' : identity.displayName,
		serviceTagIds: (tagRows as unknown as Array<{ id: string }>).map((row) => row.id),
		languageCodes: (languageRows as unknown as Array<{ code: string }>).map((row) => row.code),
		priceMinCents: prices?.min_cents ?? null,
		priceMaxCents: prices?.max_cents ?? null,
		photoPrimaryUrl: photo?.url ?? null,
		publishedAt
	};
}
