import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('US-DISC-07 empty results that help instead of a dead end', () => {
	test('TC-DISC-07a: empty state names constraints and one-tap relaxation re-runs search', async ({
		page
	}) => {
		await page.goto('/?available=1&verified=1&priceMax=10000');
		await expect(page.getByTestId('empty-search-state')).toBeVisible();
		await expect(page.getByTestId('constraining-filters')).toContainText('Available now');
		await expect(page.getByTestId('constraining-filters')).toContainText('Verified');

		const relaxation = page.getByTestId('relaxation-action').getByRole('link');
		await expect(relaxation).toContainText(/remove.*available now/i);
		await relaxation.click();

		await expect(page).not.toHaveURL(/available=1/);
		await expect(page.getByTestId('empty-search-state')).toBeVisible();
		await expect(page.getByTestId('relaxation-action').getByRole('link')).not.toContainText(
			/available now/i
		);
	});

	test('TC-DISC-07a: second relaxation removes the next priority filter', async ({ page }) => {
		await page.goto('/?available=1&verified=1&priceMax=10000');
		await page.getByTestId('relaxation-action').getByRole('link').click();
		await expect(page).not.toHaveURL(/available=1/);

		const secondRelaxation = page.getByTestId('relaxation-action').getByRole('link');
		await expect(secondRelaxation).toContainText(/under r100/i);
		await secondRelaxation.click();
		await expect(page.locator('article.card').first()).toBeVisible({ timeout: 15_000 });
	});

	test('TC-DISC-07a: orphan near=1 is named in constraining filters when relaxation widens area', async ({
		page
	}) => {
		await page.goto('/?near=1&verified=1&priceMax=10000');
		await expect(page.getByTestId('empty-search-state')).toBeVisible();
		await expect(page.getByTestId('constraining-filters')).toContainText('Near me');
		await expect(page.getByTestId('constraining-filters')).toContainText('Verified');
		await expect(page.getByTestId('relaxation-action').getByRole('link')).toContainText(
			/widen area/i
		);
	});

	test('has no critical or serious axe violations on empty search state', async ({ page }) => {
		await page.goto('/?available=1&priceMax=10000');
		await expect(page.getByTestId('empty-search-state')).toBeVisible();
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
