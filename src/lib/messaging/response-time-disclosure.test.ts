import { describe, expect, it } from 'vitest';
import {
	RESPONSE_TIME_DISCLOSURE_ONBOARDING,
	RESPONSE_TIME_DISCLOSURE_THREAD
} from './response-time-disclosure';

describe('response-time-disclosure copy', () => {
	it('states plainly that first-reply speed is measured and displayed on the profile', () => {
		for (const copy of [RESPONSE_TIME_DISCLOSURE_ONBOARDING, RESPONSE_TIME_DISCLOSURE_THREAD]) {
			expect(copy.toLowerCase()).toMatch(/first.?reply/);
			expect(copy.toLowerCase()).toMatch(/measur/);
			expect(copy.toLowerCase()).toMatch(/profile/);
		}
	});

	it('explains that ongoing chatter is excluded from the metric', () => {
		expect(RESPONSE_TIME_DISCLOSURE_ONBOARDING.toLowerCase()).toMatch(/follow-up/);
		expect(RESPONSE_TIME_DISCLOSURE_THREAD.toLowerCase()).toMatch(/follow-up/);
	});
});
