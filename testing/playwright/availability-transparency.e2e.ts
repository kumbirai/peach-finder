import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD } from '../../scripts/seed-core';

async function signInAsSeedProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

test.describe('US-AVAIL-05 no black boxes about my own signals', () => {
	test('TC-AVAIL-05a: dashboard explains badge state and expiry', async ({ page }) => {
		await signInAsSeedProvider(page);

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const statusRes = await page.request.get('/api/availability/status/me');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: {
				availability: { state: string; expiresAt: string | null; expiresInSeconds: number | null };
				activeThisWeek: {
					qualifies: boolean;
					badgeActive: boolean;
					signals: {
						signedIn: boolean;
						availabilitySet: boolean;
						availabilitySetCount: number;
						profileEdited: boolean;
						messageSent: boolean;
					};
				};
			};
		};

		expect(statusBody.data.availability.state).not.toBe('not_available');
		expect(statusBody.data.availability.expiresAt).toBeTruthy();
		expect(statusBody.data.availability.expiresInSeconds).toBeGreaterThan(0);
		expect(statusBody.data.activeThisWeek.signals.signedIn).toBe(true);
		expect(statusBody.data.activeThisWeek.signals.availabilitySet).toBe(true);
		expect(statusBody.data.activeThisWeek.signals.availabilitySetCount).toBeGreaterThan(0);
		expect(statusBody.data.activeThisWeek.qualifies).toBe(true);

		await page.reload();
		await expect(page.getByTestId('active-this-week-transparency')).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByTestId('active-this-week-headline')).toContainText(
			'Active this week, earned from your recent activity'
		);
		await expect(page.getByTestId('active-this-week-signal-signedIn')).toContainText('Signed in');
		await expect(page.getByTestId('active-this-week-signal-availabilitySet')).toContainText(
			'Set or renewed availability'
		);
		await expect(page.getByTestId('availability-expiry-countdown')).toBeVisible();
		await expect(page.getByTestId('availability-expiry-countdown')).toContainText(/Expires in/i);

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="availability-toggle"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});
