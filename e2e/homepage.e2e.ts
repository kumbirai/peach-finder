import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
	});

	test('has no critical or serious axe violations', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
