import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { loadOwnerBadgeNotice } from '../../trust-and-safety';
import {
	computePublishReadiness,
	firstIncompleteOnboardingStep,
	type MissingField,
	type OnboardingStep
} from '../domain/publish-readiness';
import { providerLanguages, providerProfiles, providerServiceTags, services } from './schema';

function toIso(value: Date | string | null | undefined): string | null {
	if (value == null) return null;
	if (value instanceof Date) return value.toISOString();
	return new Date(value).toISOString();
}

export type OwnerProfilePhoto = {
	id: string;
	photoId: string;
	isPrimary: boolean;
	cardUrl: string;
};

export type OwnerProfileService = {
	id: string;
	name: string;
	description: string | null;
	durationMinutes: number;
	priceCents: number;
};

export type OwnerProfileDto = {
	profileId: ProviderProfileId;
	publishState: string;
	phoneVisible: boolean;
	intro: string | null;
	areaId: string | null;
	areaName: string | null;
	identityBadgeNotice: { suppressed: boolean; message: string | null };
	listing: {
		state: string;
		trialStartedAt: string | null;
		trialEndsAt: string | null;
	} | null;
	readiness: { ready: boolean; missing: MissingField[] };
	onboarding: {
		steps: Array<{ step: OnboardingStep; complete: boolean }>;
		currentStep: OnboardingStep;
	};
	photos: OwnerProfilePhoto[];
	services: OwnerProfileService[];
	languageCodes: string[];
	selectedTagIds: string[];
};

export async function loadOwnerProfile(
	db: Database,
	userId: UserId
): Promise<OwnerProfileDto | null> {
	const rows = await db
		.select({
			id: providerProfiles.id,
			publishState: providerProfiles.publishState,
			phoneVisible: providerProfiles.phoneVisible,
			intro: providerProfiles.intro,
			areaId: providerProfiles.areaId
		})
		.from(providerProfiles)
		.where(eq(providerProfiles.ownerId, userId))
		.limit(1);

	const profile = rows[0];
	if (!profile) return null;

	const profileId = profile.id as ProviderProfileId;

	const [photoRows, serviceRows, languageRows, tagRows, areaRow, listingRow] = await Promise.all([
		db.execute<{ id: string; photo_id: string; is_primary: boolean; card_url: string }>(sql`
			select pp.id, pp.photo_id, pp.is_primary,
				coalesce(
					(select pv.url from media_processing.photo_variant pv
					 where pv.photo_id = pp.photo_id and pv.variant like 'card_640%'
					 limit 1),
					'/placeholder-photo.svg'
				) as card_url
			from provider_profile.provider_photo pp
			where pp.provider_profile_id = ${profileId}::uuid
			  and pp.status = 'ready'
			order by pp.sort_order
		`),
		db
			.select({
				id: services.id,
				name: services.name,
				description: services.description,
				durationMinutes: services.durationMinutes,
				priceCents: services.priceCents
			})
			.from(services)
			.where(eq(services.providerProfileId, profileId))
			.orderBy(services.sortOrder),
		db
			.select({ code: providerLanguages.languageCode })
			.from(providerLanguages)
			.where(eq(providerLanguages.providerProfileId, profileId)),
		db
			.select({ tagId: providerServiceTags.serviceTagId })
			.from(providerServiceTags)
			.where(eq(providerServiceTags.providerProfileId, profileId)),
		profile.areaId
			? db.execute<{ name: string }>(sql`
					select name from platform_configuration.area where id = ${profile.areaId}::uuid limit 1
				`)
			: Promise.resolve({ rows: [] as { name: string }[] }),
		db.execute<{
			state: string;
			trial_started_at: Date | null;
			trial_ends_at: Date | null;
		}>(sql`
			select state, trial_started_at, trial_ends_at
			from listing_billing.listing
			where provider_profile_id = ${profileId}::uuid
			limit 1
		`)
	]);

	const readyPhotoCount = photoRows.length;
	const pricedServiceCount = serviceRows.length;
	const languageCount = languageRows.length;
	const hasArea = profile.areaId != null;
	const intro = profile.intro;

	const readiness = computePublishReadiness({
		readyPhotoCount,
		intro,
		pricedServiceCount,
		languageCount,
		hasArea
	});

	const hasPhoto = readyPhotoCount >= 1;
	const hasIntro = Boolean(intro?.trim());
	const hasPricedService = pricedServiceCount >= 1;
	const hasLanguage = languageCount >= 1;

	const currentStep = firstIncompleteOnboardingStep({
		hasPhoto,
		hasIntro,
		hasPricedService,
		hasLanguage,
		hasArea
	});

	const steps: OwnerProfileDto['onboarding']['steps'] = [
		{ step: 'photos', complete: hasPhoto },
		{ step: 'intro', complete: hasIntro },
		{ step: 'services', complete: hasPricedService },
		{ step: 'languages', complete: hasLanguage },
		{ step: 'area', complete: hasArea },
		{ step: 'publish', complete: readiness.ready }
	];

	const listing = (
		listingRow as unknown as Array<{
			state: string;
			trial_started_at: Date | null;
			trial_ends_at: Date | null;
		}>
	)[0];

	const identityBadgeNotice = await loadOwnerBadgeNotice(db, profileId);

	return {
		profileId,
		publishState: profile.publishState,
		phoneVisible: profile.phoneVisible,
		intro,
		areaId: profile.areaId,
		areaName: (areaRow as { name: string }[])[0]?.name ?? null,
		identityBadgeNotice,
		listing: listing
			? {
					state: listing.state,
					trialStartedAt: toIso(listing.trial_started_at),
					trialEndsAt: toIso(listing.trial_ends_at)
				}
			: null,
		readiness: readiness.ready ? { ready: true, missing: [] } : readiness,
		onboarding: { steps, currentStep },
		photos: (
			photoRows as Array<{
				id: string;
				photo_id: string;
				is_primary: boolean;
				card_url: string;
			}>
		).map((row) => ({
			id: row.id,
			photoId: row.photo_id,
			isPrimary: row.is_primary,
			cardUrl: row.card_url
		})),
		services: serviceRows.map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			durationMinutes: row.durationMinutes,
			priceCents: row.priceCents
		})),
		languageCodes: languageRows.map((row) => row.code),
		selectedTagIds: tagRows.map((row) => row.tagId)
	};
}

export async function listServiceTagIdsForProfileDb(
	db: Database,
	profileId: ProviderProfileId
): Promise<string[]> {
	const rows = await db
		.select({ tagId: providerServiceTags.serviceTagId })
		.from(providerServiceTags)
		.where(eq(providerServiceTags.providerProfileId, profileId));
	return rows.map((row) => row.tagId);
}
