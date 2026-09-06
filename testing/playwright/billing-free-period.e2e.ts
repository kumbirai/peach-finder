import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_TRIAL_ENDS_AT
} from '../../scripts/seed-core';

async function signInAsSeedProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

test.describe('US-BILL-01 a free period I can trust (live stack)', () => {
	test('TC-BILL-01b: dashboard shows free-period end date and what happens next', async ({
		page
	}) => {
		await signInAsSeedProvider(page);

		const statusRes = await page.request.get('/api/billing/status');
		expect(statusRes.ok(), await statusRes.text()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: {
				state: string;
				trialEndsAt: string;
				dashboard: {
					headline: string;
					endDateLabel: string;
					whatHappensNext: string;
				} | null;
			};
		};

		expect(statusBody.data.state).toBe('free_listed');
		expect(statusBody.data.trialEndsAt).toBe(SEED_TRIAL_ENDS_AT.toISOString());
		expect(statusBody.data.dashboard?.headline).toBe('Free listing period');
		expect(statusBody.data.dashboard?.whatHappensNext).toMatch(/grace period/i);

		await expect(page.getByTestId('listing-billing-status')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('listing-billing-end-date')).toContainText(/September/i);
		await expect(page.getByTestId('listing-billing-what-happens-next')).toContainText(
			/hidden from search/i
		);
		await expect(page.getByTestId('listing-billing-state-chip')).toContainText('Active listing');

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="listing-billing-status"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});

	test('TC-BILL-01c: trial-ending notification dispatches within reminder window', async ({
		page
	}) => {
		await signInAsSeedProvider(page);

		const dispatchRes = await page.request.post('/api/dev/trial-ending-dispatch', {
			data: { now: '2026-09-06T12:00:00.000Z' }
		});
		expect(dispatchRes.ok(), await dispatchRes.text()).toBeTruthy();
		const dispatchBody = (await dispatchRes.json()) as { data: { sent: number } };
		expect(dispatchBody.data.sent).toBeGreaterThanOrEqual(1);

		let found = false;
		for (let attempt = 0; attempt < 5 && !found; attempt++) {
			const notifRes = await page.request.get('/api/notifications/in-app');
			expect(notifRes.ok()).toBeTruthy();
			const notifBody = (await notifRes.json()) as {
				data: Array<{ category: string; title: string }>;
			};
			found = notifBody.data.some((n) => n.category === 'billing_trial_ending');
		}
		expect(found).toBeTruthy();

		await page.reload();
		await expect(page.getByTestId('trial-ending-notification-banner')).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByTestId('trial-ending-notification-banner')).toContainText(
			/Free trial ending soon/i
		);
	});
});
