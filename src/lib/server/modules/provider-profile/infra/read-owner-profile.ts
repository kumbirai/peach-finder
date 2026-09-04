import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import {
	computePublishReadiness,
	firstIncompleteOnboardingStep,
	type MissingField,
	type OnboardingStep
} from '../domain/publish-readiness';
import { providerLanguages, providerPhotos, providerProfiles, services } from './schema';

export type OwnerProfileDto = {
	profileId: ProviderProfileId;
	publishState: string;
	phoneVisible: boolean;
	intro: string | null;
	areaId: string | null;
	readiness: { ready: boolean; missing: MissingField[] };
	onboarding: {
		steps: Array<{ step: OnboardingStep; complete: boolean }>;
		currentStep: OnboardingStep;
	};
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

	const [photoRows, serviceRows, languageRows] = await Promise.all([
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(providerPhotos)
			.where(
				and(eq(providerPhotos.providerProfileId, profileId), eq(providerPhotos.status, 'ready'))
			),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(services)
			.where(eq(services.providerProfileId, profileId)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(providerLanguages)
			.where(eq(providerLanguages.providerProfileId, profileId))
	]);

	const readyPhotoCount = photoRows[0]?.count ?? 0;
	const pricedServiceCount = serviceRows[0]?.count ?? 0;
	const languageCount = languageRows[0]?.count ?? 0;
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

	return {
		profileId,
		publishState: profile.publishState,
		phoneVisible: profile.phoneVisible,
		intro,
		areaId: profile.areaId,
		readiness: readiness.ready ? { ready: true, missing: [] } : readiness,
		onboarding: { steps, currentStep }
	};
}
