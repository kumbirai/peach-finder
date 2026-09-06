import { describe, expect, it } from 'vitest';
import {
	actionLabelForCategory,
	availabilityRenewalDeepLinkPath,
	billingDeepLinkPath,
	billingGraceCopy,
	billingPaymentCopy,
	billingTrialEndingCopy,
	billingUnpublishedCopy,
	moderationDeepLinkPath,
	moderationOutcomeCopy,
	newMessageCopy,
	notificationOpenPath,
	profileDeepLinkPath,
	reportReceiptCopy,
	reportResolutionCopy,
	reviewDeepLinkPath,
	reviewReceivedCopy,
	threadDeepLinkPath,
	verificationDeepLinkPath,
	verificationOutcomeCopy,
	welcomeDeepLinkPath
} from './notification-routing';

describe('US-NOTIF-04 notification routing', () => {
	it('TC-NOTIF-04a: message notifications deep-link to the thread', () => {
		expect(threadDeepLinkPath('thread-abc')).toBe('/messages/thread-abc');
	});

	it('TC-NOTIF-04a: billing notifications deep-link to billing self-serve', () => {
		expect(billingDeepLinkPath()).toBe('/provider/billing');
	});

	it('routes rejected verification to the resubmission form', () => {
		expect(verificationDeepLinkPath('rejected')).toBe('/provider/verify');
		expect(verificationDeepLinkPath('approved')).toBe('/provider/dashboard');
	});

	it('routes reviews to the reviews page', () => {
		expect(reviewDeepLinkPath()).toBe('/provider/reviews');
	});

	it('routes availability renewal to the dashboard renewal prompt', () => {
		expect(availabilityRenewalDeepLinkPath()).toBe('/provider/dashboard?renewAvailability=1');
	});

	it('routes report notifications to profile, not a missing account route', () => {
		expect(profileDeepLinkPath()).toBe('/profile');
	});

	it('routes moderation account actions to profile', () => {
		expect(moderationDeepLinkPath('suspend')).toBe('/profile');
		expect(moderationDeepLinkPath('unpublish')).toBe('/provider/dashboard');
	});

	it('builds open-and-mark-read API paths', () => {
		expect(notificationOpenPath('01900000-0000-7000-8000-000000000099')).toBe(
			'/api/notifications/in-app/01900000-0000-7000-8000-000000000099/open'
		);
	});

	it('exposes plain-language action labels per category', () => {
		expect(actionLabelForCategory('new_message')).toBe('Open thread');
		expect(actionLabelForCategory('billing_payment')).toBe('Manage billing');
		expect(
			actionLabelForCategory('identity_outcome', { verificationDecision: 'rejected' })
		).toBe('Resubmit verification');
		expect(actionLabelForCategory('review_received')).toBe('Read review');
	});

	it('uses action-oriented copy templates', () => {
		expect(newMessageCopy('Amara').title).toContain('Amara');
		expect(newMessageCopy('Amara', 3).title).toContain('3 new messages');
		expect(verificationOutcomeCopy('rejected').body).toMatch(/resubmission/i);
		expect(reviewReceivedCopy(5).body).toMatch(/reviews page/i);
		expect(billingPaymentCopy(false).body).toMatch(/billing/i);
		expect(billingGraceCopy('Sep 20').body).toMatch(/grace period/i);
		expect(billingUnpublishedCopy().body).toMatch(/republish/i);
		expect(billingTrialEndingCopy('Oct 1').body).toMatch(/payment method/i);
		expect(reportReceiptCopy().title).toBe('Report received');
		expect(reportResolutionCopy(true).title).toBe('Report reviewed');
		expect(moderationOutcomeCopy('suspend', 'Policy').body).toContain('Policy');
		expect(welcomeDeepLinkPath('provider')).toBe('/provider/onboarding');
	});
});
