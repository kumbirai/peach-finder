import { expect, test } from '@playwright/test';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';

test.describe('LLD §2.4 availability projection repair', () => {
	test('dashboard set-available survives a corrupted projection after reconcile', async ({
		page,
		browser
	}) => {
		test.setTimeout(90_000);
		await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
		await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
		await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });

		const toggle = page.getByTestId('availability-toggle');
		await expect(toggle).toBeVisible();
		if ((await toggle.getAttribute('aria-checked')) !== 'true') {
			await toggle.click();
			await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
		}

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const live = await page.request.get('/api/discovery/search');
		expect(live.ok()).toBeTruthy();
		const liveBody = (await live.json()) as {
			data: Array<{ providerProfileId: string; availability: { state: string } }>;
		};
		expect(
			liveBody.data.find((card) => card.providerProfileId === SEED_DUAL_ROLE_PROFILE_ID)
				?.availability.state
		).toBe('available');

		const corrupt = await page.request.post('/api/dev/search-projection-reconcile', {
			data: { action: 'corrupt_availability', providerProfileId: SEED_DUAL_ROLE_PROFILE_ID }
		});
		expect(corrupt.ok(), await corrupt.text()).toBeTruthy();

		const stale = await page.request.get('/api/discovery/search');
		const staleBody = (await stale.json()) as {
			data: Array<{ providerProfileId: string; availability: { state: string } }>;
		};
		expect(
			staleBody.data.find((card) => card.providerProfileId === SEED_DUAL_ROLE_PROFILE_ID)
				?.availability.state
		).toBe('not_available');

		const reconcile = await page.request.post('/api/dev/search-projection-reconcile', {
			data: { action: 'reconcile' }
		});
		expect(reconcile.ok(), await reconcile.text()).toBeTruthy();

		const repaired = await page.request.get('/api/discovery/search');
		const repairedBody = (await repaired.json()) as {
			data: Array<{ providerProfileId: string; availability: { state: string } }>;
		};
		expect(
			repairedBody.data.find((card) => card.providerProfileId === SEED_DUAL_ROLE_PROFILE_ID)
				?.availability.state
		).toBe('available');

		const anon = await browser.newContext();
		const home = await anon.newPage();
		await home.goto('/');
		const cardLink = home.locator(`a[href="/provider/${SEED_DUAL_ROLE_PROFILE_ID}"]`).first();
		await expect(cardLink).toBeVisible({ timeout: 15_000 });
		const cardRoot = cardLink.locator('xpath=ancestor::*[.//*[@data-component="availability-pill"] or .//*[@data-testid="unavailable-pill"]][1]');
		await expect(cardRoot.getByTestId('unavailable-pill')).toHaveCount(0);
		await expect(cardRoot.locator('[data-component="availability-pill"]')).toBeVisible();
		await anon.close();
	});
});
