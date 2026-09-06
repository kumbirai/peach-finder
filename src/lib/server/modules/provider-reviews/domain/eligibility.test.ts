import { describe, expect, it } from 'vitest';
import {
	resolveReviewEligibility,
	REVIEW_ALREADY_EXISTS_REASON,
	REVIEW_CONTACT_DAY_REASON,
	threadAgeMs
} from './eligibility';

describe('resolveReviewEligibility', () => {
	const now = new Date('2026-09-06T12:00:00.000Z');

	it('TC-REV-01a: rejects a thread one second short of 24 hours', () => {
		const createdAt = new Date(now.getTime() - 24 * 60 * 60 * 1000 + 1000);
		const result = resolveReviewEligibility({
			hasThread: true,
			threadAgeMs: threadAgeMs(createdAt, now),
			alreadyReviewed: false,
			minAgeHours: 24,
			now
		});
		expect(result.eligible).toBe(false);
		expect(result.reason).toBe(REVIEW_CONTACT_DAY_REASON);
	});

	it('TC-REV-01a: accepts a thread exactly 24 hours old', () => {
		const createdAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const result = resolveReviewEligibility({
			hasThread: true,
			threadAgeMs: threadAgeMs(createdAt, now),
			alreadyReviewed: false,
			minAgeHours: 24,
			now
		});
		expect(result.eligible).toBe(true);
	});

	it('TC-REV-01b: explains when there is no thread', () => {
		const result = resolveReviewEligibility({
			hasThread: false,
			threadAgeMs: null,
			alreadyReviewed: false,
			minAgeHours: 24,
			now
		});
		expect(result.eligible).toBe(false);
		expect(result.reason).toBe(REVIEW_CONTACT_DAY_REASON);
	});

	it('TC-REV-01c: blocks a second review for the same pair', () => {
		const result = resolveReviewEligibility({
			hasThread: true,
			threadAgeMs: 25 * 60 * 60 * 1000,
			alreadyReviewed: true,
			minAgeHours: 24,
			now
		});
		expect(result.eligible).toBe(false);
		expect(result.reason).toBe(REVIEW_ALREADY_EXISTS_REASON);
	});
});
