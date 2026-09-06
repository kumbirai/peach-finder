import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_ZERO_REVIEW_DISPLAY_NAME,
	SEED_CORE_ZERO_REVIEW_PROFILE_ID
} from '../../scripts/seed-core';

test.describe('US-REV-04 ratings I can search by, fairly', () => {
	test('TC-REV-04a: highly rated query applies configured threshold to results', async ({
		page
	}) => {
		await page.goto(`/?q=${encodeURIComponent('Highly rated massage therapist')}`);
		await expect(page).toHaveURL(/minRating=4\.5/);
		await expect(page).toHaveURL(/minReviews=3/);
		await expect(page.getByText(/therapists found/i)).toBeVisible();
		const highlyRatedChip = page.locator('[data-intent-key="highlyRated"]');
		await expect(highlyRatedChip).toBeVisible();
		await expect(highlyRatedChip).toContainText(/Highly rated \(4\.5\+\)/);

		const cards = page.locator('article.card');
		const count = await cards.count();
		expect(count).toBeGreaterThan(0);

		for (let index = 0; index < count; index++) {
			const rating = cards.nth(index).getByLabel(/Rating/i);
			await expect(rating).not.toContainText('New');
			const text = await rating.innerText();
			const average = Number.parseFloat(text.replace(/[^\d.]/g, ''));
			expect(average).toBeGreaterThanOrEqual(4.5);
		}
	});

	test('TC-REV-04b: zero-review providers show New and are excluded from rating filters', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByLabel(/Rating New/i).first()).toBeVisible();

		await page.goto('/?minRating=4');
		await expect(page.locator('article.card').first()).toBeVisible();
		await expect(page.getByLabel(/Rating New/i)).toHaveCount(0);

		await page.goto(`/provider/${SEED_CORE_ZERO_REVIEW_PROFILE_ID}`);
		await expect(page.getByTestId('profile-rating')).toContainText('New');
		await expect(page.getByTestId('profile-rating')).not.toContainText('0.0');
		await expect(page.getByTestId('profile-view')).toContainText(
			SEED_CORE_ZERO_REVIEW_DISPLAY_NAME
		);
	});

	test('has no critical or serious axe violations on highly rated search results', async ({
		page
	}) => {
		await page.goto(`/?q=${encodeURIComponent('Highly rated massage therapist')}`);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
