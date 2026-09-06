import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD } from '../../scripts/seed-core';

async function signInAsSeedProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

test.describe('US-ANLY-01 my four numbers (live stack)', () => {
	test.beforeEach(async ({ page }) => {
		const seedRes = await page.request.post('/api/dev/analytics-seed');
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();
	});

	test('TC-ANLY-01a: dashboard shows four metrics with trend and comparison', async ({ page }) => {
		await signInAsSeedProvider(page);

		const apiRes = await page.request.get('/api/analytics/dashboard?range=30');
		expect(apiRes.ok(), await apiRes.text()).toBeTruthy();
		const body = (await apiRes.json()) as {
			data: {
				profileViews: { currentTotal: string; trend: unknown[]; priorPeriodComparison: unknown };
				searchAppearances: { currentTotal: string };
				contactRequests: { currentTotal: string };
				mostSearchedServices: Array<{ tag: string }>;
			};
		};

		expect(body.data.profileViews.currentTotal).toBeTruthy();
		expect(body.data.profileViews.trend.length).toBeGreaterThan(0);
		expect(body.data.profileViews.priorPeriodComparison).toBeTruthy();
		expect(body.data.searchAppearances.currentTotal).toBeTruthy();
		expect(body.data.contactRequests.currentTotal).toBeTruthy();
		expect(body.data.mostSearchedServices[0]?.tag).toBeTruthy();

		await expect(page.getByTestId('provider-analytics')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('analytics-profile-views')).not.toHaveText('');
		await expect(page.getByTestId('analytics-most-searched-service')).toContainText(/deep tissue/i);
	});

	test('TC-ANLY-01b: range selector switches between 7/30/90-day ranges', async ({ page }) => {
		await signInAsSeedProvider(page);

		const defaultRes = await page.request.get('/api/analytics/dashboard?range=30');
		const sevenRes = await page.request.get('/api/analytics/dashboard?range=7');
		const ninetyRes = await page.request.get('/api/analytics/dashboard?range=90');

		expect(defaultRes.ok()).toBeTruthy();
		expect(sevenRes.ok()).toBeTruthy();
		expect(ninetyRes.ok()).toBeTruthy();

		const defaultBody = (await defaultRes.json()) as {
			data: { profileViews: { currentTotal: string } };
		};
		const sevenBody = (await sevenRes.json()) as {
			data: { profileViews: { currentTotal: string } };
		};
		const ninetyBody = (await ninetyRes.json()) as {
			data: { profileViews: { currentTotal: string } };
		};

		expect(defaultBody.data.profileViews.currentTotal).toBeTruthy();
		expect(sevenBody.data.profileViews.currentTotal).toBeTruthy();
		expect(ninetyBody.data.profileViews.currentTotal).toBeTruthy();

		await page.getByTestId('analytics-range-7').click();
		await expect(page).toHaveURL(/range=7/);
		await page.getByTestId('analytics-range-90').click();
		await expect(page).toHaveURL(/range=90/);
	});

	test('TC-ANLY-01c: metric definitions are shown in-product', async ({ page }) => {
		await signInAsSeedProvider(page);
		await expect(page.getByTestId('analytics-definitions')).toBeVisible();
		await page.getByTestId('analytics-definitions').locator('summary').click();
		await expect(page.getByText(/profile-page load by anyone other than you/i)).toBeVisible();
		await expect(page.getByText(/card shown in a search or homepage results set/i)).toBeVisible();
		await expect(page.getByText(/new message thread started with you/i)).toBeVisible();

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="provider-analytics"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});
