import { describe, expect, it } from 'vitest';
import {
	abbreviateReviewerName,
	formatPublicReviewDate,
	toEligibility,
	toOwnReview,
	toPublicReview,
	toRatingDisplay
} from './serializers';

describe('provider-reviews serializers', () => {
	it('TC-REV-04b: toRatingDisplay renders New for zero-review providers', () => {
		expect(toRatingDisplay(null, 0)).toEqual({ state: 'new' });
		expect(toRatingDisplay('4.5', 0)).toEqual({ state: 'new' });
	});

	it('TC-REV-04b: toRatingDisplay never emits a zero score', () => {
		expect(toRatingDisplay('4.5', 3)).toEqual({ average: 4.5, count: 3 });
		expect(JSON.stringify(toRatingDisplay(null, 0))).not.toContain('0.0');
	});

	it('abbreviates reviewer names for public display', () => {
		expect(abbreviateReviewerName('Thandi Mokoena')).toBe('Thandi M.');
		expect(abbreviateReviewerName('Former user')).toBe('Former user');
		expect(abbreviateReviewerName('Chris')).toBe('Chris');
	});

	it('formats review dates as month and year only', () => {
		expect(formatPublicReviewDate(new Date('2026-08-15T12:00:00Z'))).toMatch(/August 2026/);
	});

	it('toPublicReview omits exact timestamps and includes edited marker state', () => {
		const dto = toPublicReview({
			id: '01900000-0000-7000-8000-000000000601',
			rating: 5,
			body: 'Great session',
			isEdited: true,
			replyBody: 'Thanks for visiting.',
			createdAt: new Date('2026-09-01T12:00:00Z'),
			reviewerDisplayName: 'Naledi Sithole'
		});

		expect(dto.reviewerName).toBe('Naledi S.');
		expect(dto.dateLabel).toMatch(/September 2026/);
		expect(dto.isEdited).toBe(true);
		expect(dto.providerReply).toEqual({ body: 'Thanks for visiting.' });
		expect(JSON.stringify(dto)).not.toMatch(/2026-09-01T/);
	});

	it('toEligibility preserves reason copy for ineligible seekers', () => {
		expect(
			toEligibility({
				eligible: false,
				reason: 'You can review after you have been in contact for a day.'
			})
		).toEqual({
			eligible: false,
			reason: 'You can review after you have been in contact for a day.'
		});
	});

	it('toOwnReview returns ISO timestamp for owner views', () => {
		const createdAt = new Date('2026-09-01T12:00:00Z');
		expect(
			toOwnReview({
				id: '01900000-0000-7000-8000-000000000601',
				providerProfileId: '01900000-0000-7000-8000-000000000103',
				rating: 5,
				body: 'Great session',
				isEdited: false,
				createdAt
			})
		).toEqual({
			id: '01900000-0000-7000-8000-000000000601',
			providerProfileId: '01900000-0000-7000-8000-000000000103',
			rating: 5,
			body: 'Great session',
			isEdited: false,
			createdAt: createdAt.toISOString()
		});
	});
});
