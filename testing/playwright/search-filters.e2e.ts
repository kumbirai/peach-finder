import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import { assertPrimaryListingLive, assertSearchContainsProfile } from './live-backend-assert';

test.describe('US-DISC-04 filter and refine without losing my place', () => {
	test('TC-DISC-04a: combined price, language, and rating filters update results without reload', async ({
		page
	}) => {
		await page.goto('/');
		const initialCount = await page.locator('article.card').count();
		expect(initialCount).toBeGreaterThan(0);

		await page.getByRole('link', { name: 'Speaks isiZulu' }).click();
		await expect(page).toHaveURL(/lang=zu/);
		await expect(page.getByText(/therapists found/i)).toBeVisible();

		await page.getByRole('link', { name: '4.8+ rated' }).click();
		await expect(page).toHaveURL(/minRating=4\.8/);

		await page.getByRole('link', { name: 'Under R400' }).click();
		await expect(page).toHaveURL(/priceMax=40000/);

		const filteredCount = await page.locator('article.card').count();
		expect(filteredCount).toBeLessThanOrEqual(initialCount);
		await assertPrimaryListingLive(page.request);
		const filteredSearch = await page.request.get(
			'/api/discovery/search?lang=zu&minRating=4.8&priceMax=40000'
		);
		expect(filteredSearch.ok()).toBeTruthy();
		const filteredBody = (await filteredSearch.json()) as { data: unknown[] };
		expect(Array.isArray(filteredBody.data)).toBe(true);
		expect(filteredBody.data.length).toBeLessThanOrEqual(initialCount);
	});

	test('TC-DISC-04b: active filters render as removable chips', async ({ page }) => {
		await page.goto('/?verified=1&lang=zu');
		const verifiedChip = page.locator('[data-intent-key="verified"]');
		const zuluChip = page.locator('[data-intent-key="lang:zu"]');
		await expect(verifiedChip).toBeVisible();
		await expect(zuluChip).toBeVisible();

		await zuluChip.click();
		await expect(page).toHaveURL(/verified=1/);
		await expect(page).not.toHaveURL(/lang=zu/);
		await expect(page.locator('[data-intent-key="lang:zu"]')).not.toHaveClass(/chip-selected/);
		await expect(page.locator('[data-intent-key="verified"]')).toHaveClass(/chip-selected/);
		await assertSearchContainsProfile(page.request, SEED_CORE_PRIMARY_PROFILE_ID, '?verified=1');
	});

	test('TC-DISC-04c: zero-review providers show New and are excluded by rating filter', async ({
		page
	}) => {
		await page.goto('/');
		const newRating = page.getByLabel(/Rating New/i).first();
		await expect(newRating).toBeVisible();

		await page.goto('/?minRating=4');
		await expect(page.locator('article.card').first()).toBeVisible();
		await expect(page.getByLabel(/Rating New/i)).toHaveCount(0);
		await assertSearchContainsProfile(page.request, SEED_CORE_PRIMARY_PROFILE_ID, '?minRating=4');
	});

	test('TC-DISC-VIS-03: filter chips invert to ink background when selected', async ({ page }) => {
		await page.goto('/?verified=1');
		const chip = page.locator('[data-intent-key="verified"]');
		await expect(chip).toHaveClass(/chip-selected/);
	});

	test('has no critical or serious axe violations with active filters', async ({ page }) => {
		await page.goto('/?verified=1&lang=zu&minRating=4');
		await assertSearchContainsProfile(page.request, SEED_CORE_PRIMARY_PROFILE_ID, '?verified=1');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
