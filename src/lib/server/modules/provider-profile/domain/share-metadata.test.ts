import { describe, expect, it } from 'vitest';
import { buildShareMetadata } from './share-metadata';

describe('buildShareMetadata', () => {
	it('TC-VIEW-06b: emits display name, intro extract, and absolute primary photo URL', () => {
		const metadata = buildShareMetadata(
			'Amara T.',
			'Deep tissue specialist with 8 years of experience.',
			'/media/photos/amara-card.webp',
			'https://peachfinder.test'
		);

		expect(metadata.title).toBe('Amara T.');
		expect(metadata.description).toBe('Deep tissue specialist with 8 years of experience.');
		expect(metadata.image).toBe('https://peachfinder.test/media/photos/amara-card.webp');
	});

	it('trims and word-wraps long intros for og:description', () => {
		const intro =
			'Licensed massage therapist focusing on recovery and mobility work for athletes and desk workers across Johannesburg and Pretoria with a calm, professional studio setup.';
		const metadata = buildShareMetadata('Thandi M.', intro, null, 'https://peachfinder.test');

		expect(metadata.description.length).toBeLessThanOrEqual(150);
		expect(metadata.description.endsWith('…')).toBe(true);
		expect(metadata.image).toBeNull();
	});
});
