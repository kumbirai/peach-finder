import { REVIEW_MIN_AGE_HOURS } from './review';

export const REVIEW_CONTACT_DAY_REASON = "You can review after you've been in contact for a day.";

export const REVIEW_ALREADY_EXISTS_REASON = 'You already reviewed this provider.';

export type ReviewEligibilityState = {
	eligible: boolean;
	reason?: string;
};

export function resolveReviewEligibility(input: {
	hasThread: boolean;
	threadAgeMs: number | null;
	alreadyReviewed: boolean;
	minAgeHours: number;
	now: Date;
}): ReviewEligibilityState {
	if (input.alreadyReviewed) {
		return { eligible: false, reason: REVIEW_ALREADY_EXISTS_REASON };
	}

	if (!input.hasThread || input.threadAgeMs == null) {
		return { eligible: false, reason: REVIEW_CONTACT_DAY_REASON };
	}

	const requiredMs = input.minAgeHours * 60 * 60 * 1000;
	if (input.threadAgeMs < requiredMs) {
		return { eligible: false, reason: REVIEW_CONTACT_DAY_REASON };
	}

	return { eligible: true };
}

export function threadAgeMs(createdAt: Date, now: Date): number {
	return now.getTime() - createdAt.getTime();
}

export { REVIEW_MIN_AGE_HOURS };
