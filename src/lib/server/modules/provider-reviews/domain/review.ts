import type { ValidationIssue } from '../../../shared/result';

export const REVIEW_BODY_MAX_LENGTH = 1000;
export const REVIEW_MIN_AGE_HOURS = 24;

export type ReviewDraft = {
	rating: number;
	body: string | null;
};

export function createReview(input: {
	rating: number;
	body?: string | null;
}): { ok: true; value: ReviewDraft } | { ok: false; issues: ValidationIssue[] } {
	const issues: ValidationIssue[] = [];

	if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
		issues.push({ path: 'rating', message: 'Choose a rating from 1 to 5 stars.' });
	}

	const body = input.body?.trim() ? input.body.trim() : null;
	if (body && body.length > REVIEW_BODY_MAX_LENGTH) {
		issues.push({
			path: 'body',
			message: `Keep your review to ${REVIEW_BODY_MAX_LENGTH} characters or fewer.`
		});
	}

	if (issues.length > 0) {
		return { ok: false, issues };
	}

	return {
		ok: true,
		value: {
			rating: input.rating,
			body
		}
	};
}
