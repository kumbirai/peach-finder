import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

test.describe('US-DISC-08 cards I can shortlist from', () => {
	test.use({ viewport: { width: 360, height: 800 } });

	test('TC-DISC-08a: result cards expose every shortlist field', async ({ page }) => {
		await page.goto('/?near=1&area=rosebank');
		const amaraCard = page.locator('article.card').filter({ hasText: 'Amara T.' });
		await expect(amaraCard).toBeVisible();

		await expect(amaraCard.locator('.card-photo, .placeholder')).toBeVisible();
		await expect(amaraCard.getByRole('heading', { level: 2, name: 'Amara T.' })).toBeVisible();
		await expect(amaraCard.getByTestId('card-intro')).toContainText(/deep tissue/i);
		await expect(amaraCard.getByText(/Available now/i)).toBeVisible();
		await expect(amaraCard.getByText('Identity verified')).toBeVisible();
		await expect(amaraCard.getByText(/4\.9/)).toBeVisible();
		await expect(amaraCard.getByText(/128 reviews/)).toBeVisible();
		await expect(amaraCard.getByText(/From R650/)).toBeVisible();
		await expect(amaraCard.getByTestId('card-languages')).toContainText('English');
		await expect(amaraCard.getByText(/away|Rosebank/)).toBeVisible();
		await expect(amaraCard.getByRole('link', { name: /Message Amara/i })).toBeVisible();
	});

	test('TC-DISC-08a: unavailable cards show availability state and contact action', async ({
		page
	}) => {
		await page.goto('/');
		const unavailableCard = page
			.locator('article.card')
			.filter({ has: page.getByTestId('unavailable-pill') })
			.first();
		await expect(unavailableCard).toBeVisible();
		await expect(unavailableCard.getByTestId('unavailable-pill')).toContainText('Not available');
		await expect(unavailableCard.getByRole('link', { name: /Message /i })).toBeVisible();
	});

	test('TC-DISC-08b: photo pills stay legible and message action meets touch target at 360px', async ({
		page
	}) => {
		await page.goto('/');
		const card = page.locator('article.card').first();
		await expect(card.locator('.photo-scrim')).toBeVisible();

		const pill = card.locator(
			'[data-component="availability-pill"], [data-testid="unavailable-pill"]'
		);
		await expect(pill).toBeVisible();
		await expect(pill.locator('.text')).toBeVisible();
		await expect(pill.locator('.dot')).toBeVisible();

		const message = card.getByRole('link', { name: /Message /i });
		const messageBox = await message.boundingBox();
		expect(messageBox?.height ?? 0).toBeGreaterThanOrEqual(44);
		expect(messageBox?.width ?? 0).toBeGreaterThanOrEqual(44);
	});

	test('message action routes anonymous users to sign-in', async ({ page }) => {
		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await page.goto('/');
		await page
			.locator('article.card')
			.filter({ hasText: 'Amara T.' })
			.getByRole('link', { name: /Message Amara/i })
			.click();
		await expect(page).toHaveURL(/\/sign-in\?/);
	});

	test('has no critical or serious axe violations on shortlist cards', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
