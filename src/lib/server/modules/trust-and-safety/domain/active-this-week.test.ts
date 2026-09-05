import { describe, expect, it } from 'vitest';
import { isActiveThisWeek } from './active-this-week';

describe('isActiveThisWeek', () => {
	it('returns true when any one of the four signals is present', () => {
		expect(
			isActiveThisWeek({
				signedIn: true,
				availabilitySet: false,
				profileEdited: false,
				messageSent: false
			})
		).toBe(true);
		expect(
			isActiveThisWeek({
				signedIn: false,
				availabilitySet: true,
				profileEdited: false,
				messageSent: false
			})
		).toBe(true);
		expect(
			isActiveThisWeek({
				signedIn: false,
				availabilitySet: false,
				profileEdited: true,
				messageSent: false
			})
		).toBe(true);
		expect(
			isActiveThisWeek({
				signedIn: false,
				availabilitySet: false,
				profileEdited: false,
				messageSent: true
			})
		).toBe(true);
	});

	it('returns false when all four signals are absent', () => {
		expect(
			isActiveThisWeek({
				signedIn: false,
				availabilitySet: false,
				profileEdited: false,
				messageSent: false
			})
		).toBe(false);
	});
});
