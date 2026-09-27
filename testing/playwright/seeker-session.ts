import { expect, type APIRequestContext, type Page } from '@playwright/test';

export async function registerAndVerifySeeker(
	page: Page,
	request: APIRequestContext,
	email: string,
	password: string,
	name: string
): Promise<void> {
	await page.goto('/sign-in?returnTo=/profile');
	if ((await page.getByLabel('Your name').count()) === 0) {
		await page.locator('.toggle').getByRole('button', { name: 'Create account' }).click();
	}
	await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 15_000 });
	await page.getByLabel('Your name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
	await page.waitForLoadState('domcontentloaded');

	const tokenRes = await request.post('/api/dev/verification-token', { data: { email } });
	if (!tokenRes.ok()) {
		await page.waitForTimeout(500);
		const retry = await request.post('/api/dev/verification-token', { data: { email } });
		expect(retry.ok()).toBe(true);
		const retryData = (await retry.json()) as { data: { token: string } };
		await page.goto(`/verify-email?token=${retryData.data.token}&returnTo=/profile`, {
			waitUntil: 'domcontentloaded'
		});
	} else {
		const { data } = (await tokenRes.json()) as { data: { token: string } };
		await page.goto(`/verify-email?token=${data.token}&returnTo=/profile`, {
			waitUntil: 'domcontentloaded'
		});
	}
	await page.getByRole('button', { name: 'Verify email' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
}

export async function signInSeeker(
	page: Page,
	email: string,
	password: string,
	returnTo = '/profile'
): Promise<void> {
	await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent(returnTo)}`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(new RegExp(returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
		timeout: 15_000
	});
}

export async function signOutIfNeeded(page: Page): Promise<void> {
	await page.goto('/');
	const signOut = page.getByRole('button', { name: 'Sign out' });
	if (await signOut.isVisible().catch(() => false)) {
		await signOut.click();
		await expect(signOut).toHaveCount(0, { timeout: 15_000 });
	}
}
