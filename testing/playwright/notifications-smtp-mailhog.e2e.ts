import { expect, test } from '@playwright/test';
import { assertPrimaryListingLive } from './live-backend-assert';
import { mailhogIsReachable, waitForMailhogMessage } from './mailhog';
import { registerAndVerifySeeker } from './seeker-session';

test.describe('SMTP MailHog (SMTP2GO stand-in)', () => {
	test('TC-NOTIF-smtp: seeker registration delivers a verification email', async ({ page }) => {
		test.setTimeout(90_000);
		const reachable = await mailhogIsReachable();
		test.skip(
			!reachable,
			'MailHog is not running on MAILHOG_URL (docker compose mailhog / SMTP :1025, UI :8025)'
		);

		await page.goto('/');
		await assertPrimaryListingLive(page.request);

		const email = `smtp-mailhog-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Smtp Mailhog');

		const message = await waitForMailhogMessage({
			to: email,
			subjectIncludes: 'Verify your Peach Finder email'
		});
		const body = message.Content?.Body ?? '';
		expect(body).toContain('/verify-email?token=');
	});
});
