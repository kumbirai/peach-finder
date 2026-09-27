import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD } from '../../scripts/seed-core';
import { assertPrimaryListingLive } from './live-backend-assert';
import { registerAndPublishProvider } from './provider-session';

async function signInAsSeedProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

test.describe('US-BILL-02 one free period per person (live stack)', () => {
	test('TC-BILL-02b: resumed billing copy is plain and not accusatory', async ({ page }) => {
		const snapshotRes = await page.request.post('/api/dev/billing-continuity-snapshot', {
			data: { continuity: 'resumed', state: 'grace' }
		});
		expect(snapshotRes.ok(), await snapshotRes.text()).toBeTruthy();

		await signInAsSeedProvider(page);

		const statusRes = await page.request.get('/api/billing/status');
		expect(statusRes.ok(), await statusRes.text()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: {
				billingContinuity: string;
				dashboard: { whatHappensNext: string; stateChipLabel: string } | null;
			};
		};

		expect(statusBody.data.billingContinuity).toBe('resumed');
		expect(statusBody.data.dashboard?.whatHappensNext).toContain(
			'continues from your previous account'
		);
		expect(statusBody.data.dashboard?.whatHappensNext.toLowerCase()).not.toMatch(
			/abuse|fraud|violation|cheat/
		);

		await expect(page.getByTestId('listing-billing-status')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('listing-billing-state-chip')).toContainText('Grace period');
		await expect(page.getByTestId('listing-billing-what-happens-next')).toContainText(
			/continues from your previous account/i
		);

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="listing-billing-status"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
		await assertPrimaryListingLive(page.request);
	});

	test('TC-BILL-02b: payment-required copy states facts without accusatory framing', async ({
		page
	}) => {
		const snapshotRes = await page.request.post('/api/dev/billing-continuity-snapshot', {
			data: { continuity: 'no_trial', state: 'grace' }
		});
		expect(snapshotRes.ok(), await snapshotRes.text()).toBeTruthy();

		await signInAsSeedProvider(page);

		await expect(page.getByTestId('listing-billing-what-happens-next')).toContainText(
			/already used for a free listing period/i
		);
		await expect(page.getByTestId('listing-billing-what-happens-next')).not.toContainText(/abuse/i);
		await assertPrimaryListingLive(page.request);
	});

	test('TC-BILL-02a: a reused phone after delete does not start a new trial', async ({
		browser
	}) => {
		test.setTimeout(180_000);
		const stamp = Date.now();
		const phone = `082${String(stamp).slice(-7)}`;
		const password = 'password123';

		const first = await browser.newContext();
		const firstPage = await first.newPage();
		await registerAndPublishProvider(firstPage, firstPage.request, {
			name: 'Reuse First',
			email: `reuse-first-${stamp}@example.com`,
			phone,
			password
		});
		const firstStatus = await firstPage.request.get('/api/billing/status');
		expect(firstStatus.ok(), await firstStatus.text()).toBeTruthy();
		const firstBody = (await firstStatus.json()) as { data: { billingContinuity: string } };
		expect(firstBody.data.billingContinuity).toBe('new');
		const deleted = await firstPage.request.delete('/api/identity/account', {
			data: { password, confirm: true }
		});
		expect(deleted.ok(), await deleted.text()).toBeTruthy();
		await first.close();

		const second = await browser.newContext();
		const secondPage = await second.newPage();
		await registerAndPublishProvider(secondPage, secondPage.request, {
			name: 'Reuse Second',
			email: `reuse-second-${stamp}@example.com`,
			phone,
			password
		});
		const secondStatus = await secondPage.request.get('/api/billing/status');
		expect(secondStatus.ok(), await secondStatus.text()).toBeTruthy();
		const secondBody = (await secondStatus.json()) as {
			data: {
				billingContinuity: string;
				dashboard: { whatHappensNext: string } | null;
			};
		};
		expect(secondBody.data.billingContinuity).not.toBe('new');
		expect(['resumed', 'no_trial']).toContain(secondBody.data.billingContinuity);
		expect(secondBody.data.dashboard?.whatHappensNext.toLowerCase() ?? '').not.toMatch(
			/abuse|fraud|violation|cheat/
		);
		await assertPrimaryListingLive(secondPage.request);
		await second.close();
	});
});
