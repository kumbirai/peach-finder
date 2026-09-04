import { describe, expect, it } from 'vitest';
import { computePublishReadiness, firstIncompleteOnboardingStep } from './publish-readiness';

describe('publish-readiness', () => {
	it('flags every missing minimum field', () => {
		const result = computePublishReadiness({
			readyPhotoCount: 0,
			intro: '',
			pricedServiceCount: 0,
			languageCount: 0,
			hasArea: false
		});
		expect(result.ready).toBe(false);
		if (!result.ready) {
			expect(result.missing).toEqual(['photo', 'intro', 'priced_service', 'language', 'area']);
		}
	});

	it('returns ready when all minimum fields are present', () => {
		const result = computePublishReadiness({
			readyPhotoCount: 1,
			intro: 'Hello',
			pricedServiceCount: 1,
			languageCount: 1,
			hasArea: true
		});
		expect(result).toEqual({ ready: true });
	});

	it('picks the first incomplete onboarding step', () => {
		expect(
			firstIncompleteOnboardingStep({
				hasPhoto: true,
				hasIntro: false,
				hasPricedService: false,
				hasLanguage: false,
				hasArea: false
			})
		).toBe('intro');
	});
});
