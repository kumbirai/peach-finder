import { describe, expect, it } from 'vitest';
import {
	formatActiveThisWeekHeadline,
	formatAvailabilitySetDetail,
	formatExpiryCountdown,
	isSignalMet
} from './active-this-week-transparency';

describe('formatActiveThisWeekHeadline', () => {
	it('uses earned copy when the provider qualifies', () => {
		expect(formatActiveThisWeekHeadline(true)).toBe(
			'Active this week, earned from your recent activity'
		);
	});

	it('uses neutral guidance when the provider does not qualify', () => {
		expect(formatActiveThisWeekHeadline(false)).toBe(
			'Active this week — complete any one of these in the last 7 days'
		);
	});
});

describe('isSignalMet', () => {
	it('maps availabilitySet from the boolean flag', () => {
		expect(
			isSignalMet('availabilitySet', {
				signedIn: false,
				availabilitySet: true,
				availabilitySetCount: 2,
				profileEdited: false,
				messageSent: false
			})
		).toBe(true);
	});
});

describe('formatAvailabilitySetDetail', () => {
	it('pluralizes set counts', () => {
		expect(formatAvailabilitySetDetail(1)).toBe('1 set or renewal in the last 7 days');
		expect(formatAvailabilitySetDetail(3)).toBe('3 sets or renewals in the last 7 days');
	});
});

describe('formatExpiryCountdown', () => {
	it('formats sub-hour, hour-only, and mixed durations', () => {
		expect(formatExpiryCountdown(45)).toBe('Expires in 1 minute');
		expect(formatExpiryCountdown(3_600)).toBe('Expires in 1 hour');
		expect(formatExpiryCountdown(5_400)).toBe('Expires in 1 hour 30 minutes');
	});
});
