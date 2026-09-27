import { expect, test } from '@playwright/test';
import { SEED_CORE_PHONE_OFF_PROFILE_ID } from '../../scripts/seed-core';
import { coreJsPayloadBudgetBytes, filterApplyBudgetMs } from '../../src/lib/performance/cwv-budgets';
import { assertPrimaryListingLive, assertSearchContainsProfile } from './live-backend-assert';

test.describe('perceived quality + live discovery', () => {
	test('homepage SSR contains listings and loads within the unthrottled budget', async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		const started = Date.now();
		const response = await page.goto('/');
		expect(response?.ok()).toBeTruthy();
		const html = await page.content();
		expect(html).toMatch(/Amara T\.|available now|Find/i);
		expect(Date.now() - started).toBeLessThan(8_000);
		await context.close();

		const live = await browser.newPage();
		await live.goto('/');
		await expect(live.getByRole('heading', { level: 1 })).toBeVisible();
		await assertPrimaryListingLive(live.request);
		await live.close();
	});

	test('filter application updates the URL and live search without a full reload', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		const started = Date.now();
		await page.getByRole('link', { name: 'Speaks isiZulu' }).click();
		await expect(page).toHaveURL(/lang=zu/);
		expect(Date.now() - started).toBeLessThan(filterApplyBudgetMs());
		await expect(page.getByText(/therapists found/i)).toBeVisible();
		await assertSearchContainsProfile(page.request, SEED_CORE_PHONE_OFF_PROFILE_ID, '?lang=zu');
	});

	test('core JS transfer stays within the documented payload budget', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		const bytes = await page.evaluate(() =>
			performance
				.getEntriesByType('resource')
				.filter((entry) => entry.name.includes('.js'))
				.reduce((sum, entry) => sum + ((entry as PerformanceResourceTiming).transferSize || 0), 0)
		);
		expect(bytes).toBeLessThan(coreJsPayloadBudgetBytes());
		await assertPrimaryListingLive(page.request);
	});
});
