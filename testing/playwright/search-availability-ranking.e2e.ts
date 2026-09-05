import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function indexOfName(names: string[], target: string): number {
	return names.findIndex((name) => name === target);
}

test.describe('US-DISC-06 availability outranks everything honestly', () => {
	test('TC-DISC-06a: available providers rank above unavailable in filtered search', async ({
		page
	}) => {
		await page.goto('/?q=swedish');
		await expect(page.getByText(/therapists found/i)).toBeVisible();
		const names = await page.locator('article.card .title').allTextContents();

		const thandi = indexOfName(names, 'Thandi M.');
		const nomsa = indexOfName(names, 'Nomsa P.');
		expect(thandi).toBeGreaterThanOrEqual(0);
		if (nomsa >= 0) {
			expect(thandi).toBeLessThan(nomsa);
		}
		await expect(
			page
				.locator('article.card')
				.filter({ hasText: 'Thandi M.' })
				.getByText(/Available now/i)
		).toBeVisible();
	});

	test('TC-DISC-06b: featured-but-unavailable never beats non-featured available', async ({
		page
	}) => {
		await page.goto('/?q=deep%20tissue');
		await expect(page.locator('article.card').first()).toBeVisible();
		const names = await page.locator('article.card .title').allTextContents();

		const kagiso = indexOfName(names, 'Kagiso L.');
		const zanele = indexOfName(names, 'Zanele D.');
		expect(kagiso).toBeGreaterThanOrEqual(0);
		expect(zanele).toBeGreaterThanOrEqual(0);
		expect(kagiso).toBeLessThan(zanele);
	});

	test('TC-DISC-06c: Featured label is always visible on featured cards', async ({ page }) => {
		await page.goto('/');
		const amaraCard = page.locator('article.card').filter({ hasText: 'Amara T.' });
		await expect(amaraCard).toBeVisible();
		const featuredLabel = amaraCard.getByTestId('featured-label');
		await expect(featuredLabel).toBeVisible();
		await expect(featuredLabel).toContainText('Featured');

		const zaneleCard = page.locator('article.card').filter({ hasText: 'Zanele D.' });
		await expect(zaneleCard.getByTestId('featured-label')).toBeVisible();
	});

	test('TC-DISC-06d: seeded discoverable set excludes hidden providers', async ({ page }) => {
		await page.goto('/');
		const names = await page.locator('article.card .title').allTextContents();
		expect(names.length).toBeGreaterThanOrEqual(13);
		expect(names).not.toContain('Draft Therapist');
		expect(names).not.toContain('Unpublish Test');
	});

	test('has no critical or serious axe violations on ranked search results', async ({ page }) => {
		await page.goto('/?q=deep%20tissue');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
