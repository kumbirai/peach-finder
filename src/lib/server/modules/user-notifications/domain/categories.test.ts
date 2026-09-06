import { describe, expect, it } from 'vitest';
import {
	ESSENTIAL_CATEGORY_IDS,
	isEssentialCategory,
	isValidPreferenceChannel,
	NOTIFICATION_CATEGORIES,
	OPT_OUT_CATEGORY_IDS
} from './categories';

describe('notification categories', () => {
	it('marks billing, security, and moderation categories as essential', () => {
		expect(isEssentialCategory('billing_payment')).toBe(true);
		expect(isEssentialCategory('billing_grace')).toBe(true);
		expect(isEssentialCategory('billing_unpublished')).toBe(true);
		expect(isEssentialCategory('billing_trial_ending')).toBe(true);
		expect(isEssentialCategory('moderation_outcome')).toBe(true);
		expect(isEssentialCategory('identity_outcome')).toBe(true);
		expect(isEssentialCategory('report_receipt')).toBe(true);
	});

	it('marks engagement categories as opt-out-able', () => {
		expect(OPT_OUT_CATEGORY_IDS.has('new_message')).toBe(true);
		expect(OPT_OUT_CATEGORY_IDS.has('availability_expiry_warning')).toBe(true);
		expect(OPT_OUT_CATEGORY_IDS.has('review_received')).toBe(true);
		expect(OPT_OUT_CATEGORY_IDS.has('report_resolution')).toBe(true);
		expect(OPT_OUT_CATEGORY_IDS.has('account_welcome')).toBe(true);
	});

	it('keeps essential and opt-out sets disjoint', () => {
		for (const category of NOTIFICATION_CATEGORIES) {
			if (category.essential) {
				expect(OPT_OUT_CATEGORY_IDS.has(category.id)).toBe(false);
			} else {
				expect(ESSENTIAL_CATEGORY_IDS.has(category.id)).toBe(false);
			}
		}
	});

	it('validates known channels only', () => {
		expect(isValidPreferenceChannel('email')).toBe(true);
		expect(isValidPreferenceChannel('push')).toBe(true);
		expect(isValidPreferenceChannel('in_app')).toBe(true);
		expect(isValidPreferenceChannel('sms')).toBe(false);
	});
});
