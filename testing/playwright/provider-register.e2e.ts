import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { assertPrimaryListingLive } from './live-backend-assert';
import { submitProviderRegistrationForm } from './provider-session';

test.describe('US-PONB-01 register as a provider', () => {
	test('TC-PONB-01a: registration creates draft profile and opens onboarding checklist', async ({
		page,
		request
	}) => {
		const stamp = Date.now();
		const email = `e2e-provider-${stamp}@example.com`;
		const phone = `082${String(stamp).slice(-7)}`;

		await submitProviderRegistrationForm(page, {
			name: 'E2E Provider',
			email,
			phone,
			password: 'password123'
		});

		const otpId = await page.locator('input[name="otpId"]').inputValue();
		expect(otpId).toBeTruthy();

		const otpRes = await request.post('/api/dev/otp-code', { data: { otpId } });
		expect(otpRes.ok()).toBe(true);
		const { data } = (await otpRes.json()) as { data: { code: string } };

		await page.getByLabel('Verification code').fill(data.code);
		await page.getByRole('button', { name: 'Verify and continue' }).click();

		await expect(page).toHaveURL(/\/provider\/onboarding/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Profile setup checklist' })).toBeVisible();
	});

	test('TC-PONB-01c: form values survive OTP failure', async ({ page, request }) => {
		const stamp = Date.now();
		const email = `e2e-otp-fail-${stamp}@example.com`;
		const phone = `083${String(stamp).slice(-7)}`;
		const displayName = 'Persist Values';

		await submitProviderRegistrationForm(page, {
			name: displayName,
			email,
			phone,
			password: 'password123'
		});

		await page.getByLabel('Verification code').fill('000000');
		await page.getByRole('button', { name: 'Verify and continue' }).click();
		await expect(page.getByText(/incorrect/i)).toBeVisible();
		await expect(page.getByText(displayName, { exact: false })).toBeVisible();
		await expect(page.getByText(phone)).toBeVisible();

		const otpId = await page.locator('input[name="otpId"]').inputValue();
		const otpRes = await request.post('/api/dev/otp-code', { data: { otpId } });
		const { data } = (await otpRes.json()) as { data: { code: string } };
		await page.getByLabel('Verification code').fill(data.code);
		await page.getByRole('button', { name: 'Verify and continue' }).click();
		await expect(page).toHaveURL(/\/provider\/onboarding/);
	});

	test('provider registration has no critical or serious axe violations', async ({ page }) => {
		await page.goto('/provider/register');
		await assertPrimaryListingLive(page.request);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
