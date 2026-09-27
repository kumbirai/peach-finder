import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { assertPrimaryListingLive } from './live-backend-assert';

test.describe('US-PRIV-04 terms I actually agreed to', () => {
	test('TC-PRIV-04a: privacy policy and ToS linked from footer, sign-up, and provider onboarding', async ({
		page
	}) => {
		await page.goto('/');
		const footer = page.getByTestId('site-footer');
		await expect(footer.getByTestId('privacy-policy-link')).toHaveAttribute('href', '/privacy');
		await expect(footer.getByTestId('terms-of-service-link')).toHaveAttribute('href', '/terms');

		await page.goto('/sign-in?flow=sign-up');
		await expect(page.getByTestId('privacy-policy-link').first()).toHaveAttribute(
			'href',
			'/privacy'
		);
		await expect(page.getByTestId('terms-of-service-link').first()).toHaveAttribute(
			'href',
			'/terms'
		);

		await page.goto('/provider/register');
		await expect(page.getByTestId('privacy-policy-link').first()).toHaveAttribute(
			'href',
			'/privacy'
		);
		await expect(page.getByTestId('terms-of-service-link').first()).toHaveAttribute(
			'href',
			'/terms'
		);

		await page.goto('/sign-in?flow=sign-in&returnTo=/provider/onboarding');
		await page.getByLabel('Email').fill('dual@example.com');
		await page.getByLabel('Password').fill('password123');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/provider\/onboarding/, { timeout: 15_000 });

		const onboardingLegal = page.getByTestId('onboarding-legal-links');
		await expect(onboardingLegal.getByTestId('privacy-policy-link')).toHaveAttribute(
			'href',
			'/privacy'
		);
		await expect(onboardingLegal.getByTestId('terms-of-service-link')).toHaveAttribute(
			'href',
			'/terms'
		);

		const privacy = await page.goto('/privacy');
		expect(privacy?.ok()).toBeTruthy();
		await expect(page.getByTestId('privacy-policy-page')).toBeVisible();
		const terms = await page.goto('/terms');
		expect(terms?.ok()).toBeTruthy();
		await expect(page.getByTestId('terms-of-service-page')).toBeVisible();
	});

	test('TC-PRIV-04b: seeker registration blocked until affirmative acceptance', async ({
		page
	}) => {
		const stamp = Date.now();
		const email = `e2e-no-terms-${stamp}@example.com`;

		await page.goto('/sign-in?flow=sign-up');
		await page.getByLabel('Your name').fill('Terms Gate Seeker');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		const termsCheckbox = page.locator('input[name="acceptedTerms"]');
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(termsCheckbox).toHaveJSProperty('validity.valid', false);

		const bypass = await page.request.post('/sign-in?/register', {
			form: {
				displayName: 'Terms Gate Seeker',
				email,
				password: 'password123',
				returnTo: '/',
				messageDraft: ''
			}
		});
		const bypassBody = await bypass.text();
		expect(bypass.status() === 422 || /accept the terms/i.test(bypassBody)).toBeTruthy();
		const login = await page.request.post('/sign-in?/login', {
			form: {
				email,
				password: 'password123',
				returnTo: '/profile',
				messageDraft: ''
			}
		});
		const loginBody = await login.text();
		expect(login.status() === 403 || /invalid email or password/i.test(loginBody)).toBeTruthy();
		const ping = await page.request.get('/api/session/ping');
		expect(ping.status()).toBeGreaterThanOrEqual(400);
	});

	test('TC-PRIV-04b: provider registration blocked until affirmative acceptance', async ({
		page
	}) => {
		const stamp = Date.now();
		const email = `e2e-provider-no-terms-${stamp}@example.com`;
		const phone = `082${String(stamp).slice(-7)}`;

		await page.goto('/provider/register');
		await page.getByLabel('Your name').fill('Terms Gate Provider');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Mobile number').fill(phone);
		await page.locator('#areaId').selectOption({ index: 1 });
		await page.getByLabel('Password').fill('password123');
		const termsCheckbox = page.locator('input[name="acceptedTerms"]');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(termsCheckbox).toHaveJSProperty('validity.valid', false);
		await expect(page.getByLabel('Verification code')).not.toBeVisible();

		const areaId = await page.locator('#areaId option').nth(1).getAttribute('value');
		expect(areaId).toBeTruthy();
		const bypass = await page.request.post('/provider/register?/register', {
			form: {
				displayName: 'Terms Gate Provider',
				email,
				phone,
				areaId: areaId!,
				password: 'password123'
			}
		});
		const bypassBody = await bypass.text();
		expect(bypass.status() === 422 || /accept the terms/i.test(bypassBody)).toBeTruthy();
		await expect(page.getByLabel('Verification code')).not.toBeVisible();
	});

	test('legal pages meet accessibility baseline', async ({ page }) => {
		await page.goto('/privacy');
		await assertPrimaryListingLive(page.request);
		const privacyResults = await new AxeBuilder({ page }).analyze();
		expect(
			privacyResults.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toHaveLength(0);

		await page.goto('/terms');
		await assertPrimaryListingLive(page.request);
		const termsResults = await new AxeBuilder({ page }).analyze();
		expect(
			termsResults.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toHaveLength(0);
	});
});
