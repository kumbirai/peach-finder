import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('US-PONB-01 register as a provider', () => {
	test('TC-PONB-01a: registration creates draft profile and opens onboarding checklist', async ({
		page,
		request
	}) => {
		const stamp = Date.now();
		const email = `e2e-provider-${stamp}@example.com`;
		const phone = `082${String(stamp).slice(-7)}`;

		await page.goto('/provider/register');
		await page.getByLabel('Your name').fill('E2E Provider');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Mobile number').fill(phone);
		await page.locator('#areaId').selectOption({ index: 1 });
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByLabel('Verification code')).toBeVisible({ timeout: 10_000 });

		const otpId = await page.locator('input[name="otpId"]').inputValue();
		expect(otpId).toBeTruthy();

		const otpRes = await request.post('/api/dev/otp-code', { data: { otpId } });
		expect(otpRes.ok()).toBe(true);
		const { data } = (await otpRes.json()) as { data: { code: string } };

		await page.getByLabel('Verification code').fill(data.code);
		await page.getByRole('button', { name: 'Verify and continue' }).click();

		await expect(page).toHaveURL(/\/provider\/onboarding/, { timeout: 15_000 });
		await expect(page.getByRole('heading', { name: 'Set up your profile' })).toBeVisible();
		await expect(page.getByRole('list', { name: 'Profile setup checklist' })).toBeVisible();
	});

	test('TC-PONB-01c: form values survive OTP failure', async ({ page, request }) => {
		const stamp = Date.now();
		const email = `e2e-otp-fail-${stamp}@example.com`;
		const phone = `083${String(stamp).slice(-7)}`;
		const displayName = 'Persist Values';

		await page.goto('/provider/register');
		await page.getByLabel('Your name').fill(displayName);
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Mobile number').fill(phone);
		await page.locator('#areaId').selectOption({ index: 1 });
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByLabel('Verification code')).toBeVisible();

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
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
