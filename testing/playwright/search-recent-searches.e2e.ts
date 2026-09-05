import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function waitForRecentSearchCount(page: import('@playwright/test').Page, count: number) {
	await page.waitForFunction((expected) => {
		const raw = localStorage.getItem('pf_recent_searches');
		if (!raw) return false;
		const parsed = JSON.parse(raw) as unknown[];
		return Array.isArray(parsed) && parsed.length >= expected;
	}, count);
}

test.describe('US-DISC-09 re-run my recent searches', () => {
	test('TC-DISC-09a: recent search stored, re-runnable, clearable', async ({ page }) => {
		await page.goto('/?q=massage%20therapist&verified=1');
		await expect(page.getByText(/therapists found/i)).toBeVisible();
		await waitForRecentSearchCount(page, 1);

		await page.goto('/');
		const recentSection = page.getByTestId('recent-searches');
		await expect(recentSection).toBeVisible();
		await expect(recentSection.getByTestId('recent-search-rerun')).toContainText(
			'massage therapist'
		);

		const storageKey = await page.evaluate(() => {
			const keys = Object.keys(localStorage);
			return keys.find((key) => key.startsWith('pf_') && key.includes('recent'));
		});
		expect(storageKey).toBe('pf_recent_searches');

		await recentSection.getByTestId('recent-search-rerun').click();
		await expect(page).toHaveURL(/q=massage(\+|%20)therapist/);
		await expect(page).toHaveURL(/verified=1/);
		await expect(page.getByText(/therapists found/i)).toBeVisible();

		await page.goto('/');
		await expect(page.getByTestId('recent-searches')).toBeVisible();
		await page.getByTestId('recent-search-clear').click();
		await expect(page.getByTestId('recent-searches')).toHaveCount(0);

		const remaining = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('pf_recent_searches') ?? '[]')
		);
		expect(remaining).toEqual([]);
	});

	test('TC-DISC-09a: clear all removes every recent search entry', async ({ page }) => {
		await page.goto('/?verified=1');
		await waitForRecentSearchCount(page, 1);
		await page.goto('/?q=deep%20tissue');
		await waitForRecentSearchCount(page, 2);
		await page.goto('/');

		await expect(page.getByTestId('recent-search-item')).toHaveCount(2);
		await page.getByTestId('recent-searches-clear-all').click();
		await expect(page.getByTestId('recent-searches')).toHaveCount(0);
	});

	test('has no critical or serious axe violations on recent searches', async ({ page }) => {
		await page.goto('/?q=deep%20tissue');
		await waitForRecentSearchCount(page, 1);
		await page.goto('/');
		await expect(page.getByTestId('recent-searches')).toBeVisible();

		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
