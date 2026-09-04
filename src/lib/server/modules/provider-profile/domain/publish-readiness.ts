export type MissingField = 'photo' | 'intro' | 'priced_service' | 'language' | 'area';

export type PublishReadinessInput = {
	readyPhotoCount: number;
	intro: string | null;
	pricedServiceCount: number;
	languageCount: number;
	hasArea: boolean;
};

export function computePublishReadiness(
	input: PublishReadinessInput
): { ready: true } | { ready: false; missing: MissingField[] } {
	const missing: MissingField[] = [];
	if (input.readyPhotoCount < 1) missing.push('photo');
	const intro = input.intro?.trim() ?? '';
	if (!intro) missing.push('intro');
	if (input.pricedServiceCount < 1) missing.push('priced_service');
	if (input.languageCount < 1) missing.push('language');
	if (!input.hasArea) missing.push('area');
	if (missing.length === 0) return { ready: true };
	return { ready: false, missing };
}

export type OnboardingStep = 'photos' | 'intro' | 'services' | 'languages' | 'area' | 'publish';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
	'photos',
	'intro',
	'services',
	'languages',
	'area',
	'publish'
] as const;

export function firstIncompleteOnboardingStep(input: {
	hasPhoto: boolean;
	hasIntro: boolean;
	hasPricedService: boolean;
	hasLanguage: boolean;
	hasArea: boolean;
}): OnboardingStep {
	if (!input.hasPhoto) return 'photos';
	if (!input.hasIntro) return 'intro';
	if (!input.hasPricedService) return 'services';
	if (!input.hasLanguage) return 'languages';
	if (!input.hasArea) return 'area';
	return 'publish';
}
