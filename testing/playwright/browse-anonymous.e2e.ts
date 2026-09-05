import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../scripts/seed-core';

test.describe('US-ACC-01 anonymous browse', () => {
	test('TC-ACC-01a: homepage search filter and profile without login wall', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Find relief, right now.');
		await expect(page.getByText(/therapists found/i)).toBeVisible();

		await page.getByLabel('Search therapists').fill('zulu');
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page).toHaveURL(/\?q=zulu/);

		await page.goto('/?q=zulu&verified=1');
		await expect(page).toHaveURL(/verified=1/);

		const firstCard = page.locator('.card').first();
		await firstCard.click();
		await expect(page).toHaveURL(/\/provider\//);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByText('About')).toBeVisible();
		await expect(page.getByText('Services')).toBeVisible();
	});

	test('TC-ACC-01b: gated actions visible and route to sign-in', async ({ page }) => {
		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const contactBar = page.getByRole('group', { name: 'Contact actions' });
		const message = contactBar.getByRole('link', { name: 'Message' });
		const review = contactBar.getByRole('link', { name: 'Review' });
		const report = contactBar.getByRole('link', { name: 'Report' });
		const block = contactBar.getByRole('link', { name: 'Block' });
		await expect(message).toBeVisible();
		await expect(review).toBeVisible();
		await expect(report).toBeVisible();
		await expect(block).toBeVisible();

		await message.click();
		await expect(page).toHaveURL(/\/sign-in\?/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			/sign in|create your account/i
		);

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await block.click();
		await expect(page).toHaveURL(/action=block/);
	});

	test('homepage has no critical or serious axe violations', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
