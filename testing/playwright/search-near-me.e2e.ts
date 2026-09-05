import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROSEBANK = { latitude: -26.1448, longitude: 28.0416 };

async function clickNearMe(page: import('@playwright/test').Page) {
	await page.waitForLoadState('networkidle');
	const nearMe = page.getByTestId('near-me-button');
	await nearMe.scrollIntoViewIfNeeded();
	await nearMe.click();
}

test.describe('US-DISC-05 near me without giving up my privacy', () => {
	test('TC-DISC-05a: granting location enables proximity ordering and distance labels', async ({
		page,
		context
	}) => {
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation(ROSEBANK);
		await page.addInitScript(() => {
			navigator.geolocation.getCurrentPosition = (success) => {
				success({
					coords: {
						latitude: -26.1448,
						longitude: 28.0416,
						accuracy: 1,
						altitude: null,
						altitudeAccuracy: null,
						heading: null,
						speed: null
					},
					timestamp: Date.now()
				});
			};
		});
		await page.goto('/');
		await clickNearMe(page);
		await expect(page).toHaveURL(/near=1/);
		await expect(page.getByTestId('proximity-active')).toBeVisible();
		await expect(page.getByTestId('proximity-status')).toHaveText('Near you');
		await expect(page).toHaveURL(/lat=/);
		await expect(page).toHaveURL(/lng=/);
		await expect(page.locator('[aria-label$="away"]').first()).toBeVisible();
	});

	test('TC-DISC-05b: denying location offers manual area entry', async ({ page }) => {
		await page.addInitScript(() => {
			navigator.geolocation.getCurrentPosition = (_success, error) => {
				error?.({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 });
			};
		});
		await page.goto('/');
		await clickNearMe(page);
		await expect(page.getByTestId('manual-area-entry')).toBeVisible();
		await page.getByPlaceholder('e.g. Rosebank').fill('rose');
		await page.getByRole('option', { name: /rosebank/i }).click();
		await expect(page).toHaveURL(/area=rosebank/);
		await expect(page).toHaveURL(/near=1/);
		await expect(page.getByTestId('proximity-status')).toHaveText('Near Rosebank');
		await expect(page.locator('[aria-label$="away"]').first()).toBeVisible();
	});

	test('TC-DISC-05d: unresolved area slug keeps Near me control, not a false active state', async ({
		page
	}) => {
		await page.goto('/?near=1&area=nonexistent-slug-xyz');
		await expect(page.getByTestId('proximity-active')).not.toBeVisible();
		await expect(page.getByTestId('near-me-button')).toBeVisible();
		await expect(page.getByTestId('orphan-proximity-clear')).toBeVisible();
		await expect(page.locator('[data-intent-key="near"].chip-selected')).toHaveCount(0);
		await Promise.all([page.waitForURL('/'), page.getByTestId('orphan-proximity-clear').click()]);
	});

	test('TC-DISC-05e: unavailable geolocation shows accurate manual-area hint', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'geolocation', {
				configurable: true,
				value: undefined
			});
		});
		await page.goto('/');
		await clickNearMe(page);
		await expect(page.getByTestId('manual-area-entry')).toBeVisible();
		await expect(page.getByText('Location is unavailable in this browser.')).toBeVisible();
	});

	test('has no critical or serious axe violations with proximity active', async ({
		page,
		context
	}) => {
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation(ROSEBANK);
		await page.goto('/?near=1&lat=-26.1448&lng=28.0416');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
