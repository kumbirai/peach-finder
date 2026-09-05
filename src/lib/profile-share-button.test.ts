import { describe, expect, it } from 'vitest';
import {
	COPY_PROFILE_LINK_LABEL,
	LINK_COPIED_LABEL,
	PROFILE_SHARE_FEEDBACK_MS,
	PROFILE_SHARE_FEEDBACK_REDUCED_MS,
	profileShareFeedbackDelayMs
} from './profile-share-button';

describe('profile-share-button', () => {
	it('exports the copy-link labels used by ProfileShareButton', () => {
		expect(COPY_PROFILE_LINK_LABEL).toBe('Copy profile link');
		expect(LINK_COPIED_LABEL).toBe('Link copied');
	});

	it('profileShareFeedbackDelayMs keeps readable feedback when motion is reduced', () => {
		expect(profileShareFeedbackDelayMs(false)).toBe(PROFILE_SHARE_FEEDBACK_MS);
		expect(profileShareFeedbackDelayMs(true)).toBe(PROFILE_SHARE_FEEDBACK_REDUCED_MS);
		expect(profileShareFeedbackDelayMs(true)).toBeGreaterThan(0);
	});
});
