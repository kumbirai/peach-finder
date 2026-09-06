import { describe, expect, it } from 'vitest';
import { createReview, REVIEW_BODY_MAX_LENGTH } from './review';

describe('createReview', () => {
	it('accepts rating with optional body', () => {
		const result = createReview({ rating: 5, body: 'Great session.' });
		expect(result).toEqual({ ok: true, value: { rating: 5, body: 'Great session.' } });
	});

	it('treats blank body as null', () => {
		const result = createReview({ rating: 4, body: '   ' });
		expect(result).toEqual({ ok: true, value: { rating: 4, body: null } });
	});

	it('rejects invalid ratings', () => {
		const result = createReview({ rating: 0 });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.path).toBe('rating');
		}
	});

	it('rejects bodies over the cap', () => {
		const result = createReview({ rating: 3, body: 'x'.repeat(REVIEW_BODY_MAX_LENGTH + 1) });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.path).toBe('body');
		}
	});
});
