import { describe, expect, it } from 'vitest';
import { createReview, editReview, REVIEW_BODY_MAX_LENGTH } from './review';

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

	it('TC-REV-02a: accepts provocative text without content screening', () => {
		const result = createReview({
			rating: 1,
			body: 'spam scam harassment — no pre-moderation filter applies.'
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.body).toContain('spam scam');
		}
	});
});

describe('editReview', () => {
	it('TC-REV-03a: updates rating and body with validation', () => {
		const current = { rating: 4, body: 'Good session.' };
		const result = editReview(current, { rating: 5, body: 'Even better after reflection.' });
		expect(result).toEqual({
			ok: true,
			value: { rating: 5, body: 'Even better after reflection.' }
		});
	});

	it('keeps unchanged fields when omitted', () => {
		const current = { rating: 3, body: 'Fine.' };
		const result = editReview(current, { body: 'Updated text only.' });
		expect(result).toEqual({
			ok: true,
			value: { rating: 3, body: 'Updated text only.' }
		});
	});

	it('rejects invalid rating on edit', () => {
		const result = editReview({ rating: 4, body: 'Good.' }, { rating: 6 });
		expect(result.ok).toBe(false);
	});
});
