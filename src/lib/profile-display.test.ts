import { describe, expect, it } from 'vitest';
import {
	formatOnlineStatus,
	formatRatingLabel,
	formatResponseTime,
	formatReviewDate,
	reviewerInitialName
} from './profile-display';

describe('profile-display', () => {
	it('formats rating labels', () => {
		expect(formatRatingLabel({ state: 'new' })).toBe('New');
		expect(formatRatingLabel({ average: 4.9, count: 128 })).toBe('4.9 (128 reviews)');
	});

	it('formats online status buckets', () => {
		expect(formatOnlineStatus('online')).toBe('Online now');
		expect(formatOnlineStatus('today')).toBe('Active today');
		expect(formatOnlineStatus('this_week')).toBe('Active this week');
		expect(formatOnlineStatus('a_while_ago')).toBe('Active a while ago');
		expect(formatOnlineStatus(null)).toBeNull();
	});

	it('formats response time buckets', () => {
		expect(formatResponseTime('within_30_min')).toBe('Usually responds within 30 minutes');
		expect(formatResponseTime('within_a_few_hours')).toBe('Usually responds within a few hours');
		expect(formatResponseTime(null)).toBeNull();
	});

	it('formats review dates as month and year only', () => {
		expect(formatReviewDate('2026-08-15T12:00:00Z')).toMatch(/August 2026/);
	});

	it('abbreviates reviewer names for privacy', () => {
		expect(reviewerInitialName('Naledi Mokoena')).toBe('Naledi M.');
	});
});
