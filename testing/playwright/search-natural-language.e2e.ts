import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BRD_QUERIES = [
	'Massage therapist available now',
	'Deep tissue massage near me',
	'Massage therapist available tonight',
	'Highly rated massage therapist',
	'Massage therapist who speaks Zulu'
] as const;

test.describe('US-DISC-02 search the way I would say it', () => {
	test('TC-DISC-02a: every BRD example query returns sensibly filtered results', async ({
		page
	}) => {
		for (const query of BRD_QUERIES) {
			await page.goto(`/?q=${encodeURIComponent(query)}`);
			await expect(page.getByText(/therapists found/i)).toBeVisible();
			await expect(page.locator('a.card').first()).toBeVisible();
			await expect(page.getByText('No therapists match those filters.')).toHaveCount(0);
		}
	});

	test('TC-DISC-02b: identical result ordering across anonymous sessions', async ({ browser }) => {
		const query = 'Highly rated massage therapist';
		const contextA = await browser.newContext();
		const contextB = await browser.newContext();
		const pageA = await contextA.newPage();
		const pageB = await contextB.newPage();

		await pageA.goto(`/?q=${encodeURIComponent(query)}`);
		await pageB.goto(`/?q=${encodeURIComponent(query)}`);

		const namesA = await pageA.locator('a.card .title').allTextContents();
		const namesB = await pageB.locator('a.card .title').allTextContents();
		expect(namesA).toEqual(namesB);

		await contextA.close();
		await contextB.close();
	});

	test('TC-DISC-02c: derived filters render as removable chips', async ({ page }) => {
		await page.goto(`/?q=${encodeURIComponent('Massage therapist who speaks Zulu')}`);
		await expect(page).toHaveURL(/lang=zu/);
		const zuluChip = page.locator('[data-intent-key="lang:zu"]');
		await expect(zuluChip).toBeVisible();
		await zuluChip.click();
		await expect(page).toHaveURL(/\/(\?.*)?$/);
		await expect(page).not.toHaveURL(/lang=zu/);
		await expect(page.locator('[data-intent-key="lang:zu"]')).toHaveCount(0);
	});

	test('TC-DISC-VIS-03: search bar stays sticky while scrolling', async ({ page }) => {
		await page.goto('/');
		const sticky = page.locator('.search-sticky');
		const before = await sticky.boundingBox();
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const after = await sticky.boundingBox();
		expect(before?.y).toBeDefined();
		expect(after?.y).toBeDefined();
		expect(after!.y).toBeGreaterThan(0);
	});

	test('has no critical or serious axe violations on search results', async ({ page }) => {
		await page.goto(`/?q=${encodeURIComponent('Deep tissue massage near me')}`);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
