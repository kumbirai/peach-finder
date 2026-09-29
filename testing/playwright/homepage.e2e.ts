import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { assertPrimaryListingLive, assertSearchContainsProfile } from './live-backend-assert';

const NOMSA_PROFILE_ID = '01900000-0000-7000-8000-000000000104';

test.describe('homepage smoke', () => {
	test('renders the SSR homepage with design-system tokens', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.ok()).toBe(true);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Find relief, right now.');
		const cream = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(cream).toBe('rgb(251, 247, 242)');
		await expect(page.locator('[data-admin-ink-strip]')).toHaveCount(0);
		const html = await page.content();
		expect(html).toContain('Find relief, right now');
		await assertPrimaryListingLive(page.request);
		await assertSearchContainsProfile(page.request, NOMSA_PROFILE_ID, '?q=Nomsa');
		await expect(page.getByRole('heading', { name: 'More therapists nearby' })).toBeVisible();
		await expect(page.locator('article.card').filter({ hasText: 'Amara T.' })).toBeVisible();
		await expect(page.locator('article.card').filter({ hasText: 'Nomsa P.' })).toBeVisible({
			timeout: 15_000
		});
	});

	test('has no critical or serious axe violations', async ({ page }) => {
		await page.goto('/');
		await assertPrimaryListingLive(page.request);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
