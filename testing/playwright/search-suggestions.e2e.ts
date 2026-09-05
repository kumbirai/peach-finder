import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SEED_PROVIDER_NAMES = [
	'Amara T.',
	'Thandi M.',
	'Lerato K.',
	'Nomsa P.',
	'Zanele D.',
	'Sipho N.',
	'Ayanda R.',
	'Kagiso L.',
	'Naledi S.',
	'Boitumelo H.',
	'Mandla Z.',
	'Refilwe G.'
];

async function typeForSuggestions(page: import('@playwright/test').Page, text: string) {
	const input = page.getByRole('combobox', { name: 'Search therapists' });
	await input.click();
	await input.pressSequentially(text, { delay: 30 });
	await expect(page.getByTestId('search-suggestion').first()).toBeVisible({ timeout: 5000 });
}

test.describe('US-DISC-03 suggestions as I type', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test('TC-DISC-03a: suggestions render quickly after typing a partial service term', async ({
		page
	}) => {
		const started = Date.now();
		await typeForSuggestions(page, 'dee');
		const firstSuggestion = page.getByTestId('search-suggestion').first();
		await expect(firstSuggestion).toContainText(/deep tissue/i);
		expect(Date.now() - started).toBeLessThan(2000);
	});

	test('TC-DISC-03b: typing a provider name never surfaces individual provider names', async ({
		page
	}) => {
		const input = page.getByRole('combobox', { name: 'Search therapists' });
		await input.click();
		await input.pressSequentially('Amara T.', { delay: 30 });
		await page.waitForTimeout(200);
		const panel = page.getByTestId('search-suggestions-panel');
		if (await panel.isVisible()) {
			const suggestionTexts = await page.getByTestId('search-suggestion').allTextContents();
			for (const providerName of SEED_PROVIDER_NAMES) {
				expect(suggestionTexts.join(' ')).not.toContain(providerName);
			}
		} else {
			await expect(page.getByTestId('search-suggestion')).toHaveCount(0);
		}
	});

	test('selecting a suggestion navigates to search results', async ({ page }) => {
		await typeForSuggestions(page, 'deep');
		const suggestion = page.getByTestId('search-suggestion').filter({ hasText: /deep tissue/i });
		await expect(suggestion).toBeVisible();
		await suggestion.click();
		await expect(page).toHaveURL(/q=deep(\+|%20)tissue|tag=/i);
		await expect(page.locator('article.card').first()).toBeVisible();
	});

	test('clears stale suggestions immediately when the query prefix changes', async ({ page }) => {
		await typeForSuggestions(page, 'dee');
		await expect(
			page.getByTestId('search-suggestion').filter({ hasText: /deep tissue/i })
		).toBeVisible();
		const input = page.getByRole('combobox', { name: 'Search therapists' });
		await input.fill('ama');
		await expect(
			page.getByTestId('search-suggestion').filter({ hasText: /deep tissue/i })
		).toHaveCount(0);
		await expect(page.locator('.suggestions-skeleton')).toBeVisible();
	});

	test('shows skeleton suggestions panel while loading, not a bare spinner', async ({ page }) => {
		const input = page.getByRole('combobox', { name: 'Search therapists' });
		await input.click();
		await input.pressSequentially('de', { delay: 80 });
		const panel = page.getByTestId('search-suggestions-panel');
		await expect(panel).toBeVisible();
		await expect(page.locator('.suggestions-skeleton, .suggestion').first()).toBeVisible();
		await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
	});

	test('has no critical or serious axe violations with suggestions open', async ({ page }) => {
		await typeForSuggestions(page, 'deep');
		await expect(page.getByTestId('search-suggestion').first()).toBeVisible();
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
