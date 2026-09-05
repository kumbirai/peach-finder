import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function registerSeeker(
	page: import('@playwright/test').Page,
	email: string,
	password: string
) {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill('E2E Seeker');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/profile/);
}

async function signInSeeker(
	page: import('@playwright/test').Page,
	email: string,
	password: string
) {
	await page.goto('/sign-in?returnTo=/profile&flow=sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.locator('form button[type="submit"]').click();
	await expect(page).toHaveURL(/\/profile/);
}

test.describe('US-ACC-03 stay signed in, sign out anywhere', () => {
	test('TC-ACC-03a: session persists across browser restarts', async ({ browser }) => {
		const email = `persist-${Date.now()}@example.com`;
		const password = 'password123';
		const context = await browser.newContext();
		const page = await context.newPage();

		await registerSeeker(page, email, password);
		await expect(page.getByText('E2E Seeker')).toBeVisible();

		const storage = await context.storageState();
		await context.close();

		const restored = await browser.newContext({ storageState: storage });
		const again = await restored.newPage();
		await again.goto('/profile');
		await expect(again.getByText('E2E Seeker')).toBeVisible();
		await restored.close();
	});

	test('TC-ACC-03b: sign out revokes only the current device session', async ({ browser }) => {
		const email = `signout-${Date.now()}@example.com`;
		const password = 'password123';

		const contextA = await browser.newContext();
		const pageA = await contextA.newPage();
		await registerSeeker(pageA, email, password);

		const contextB = await browser.newContext();
		const pageB = await contextB.newPage();
		await signInSeeker(pageB, email, password);

		await pageA.getByLabel('Account').getByRole('button', { name: 'Sign out' }).click();
		await expect(pageA).toHaveURL('/');

		await pageA.goto('/profile');
		await expect(pageA.getByRole('link', { name: 'Sign in' })).toBeVisible();

		await pageB.goto('/profile');
		await expect(pageB.getByText('E2E Seeker')).toBeVisible();

		await contextA.close();
		await contextB.close();
	});

	test('TC-ACC-03c: password reset link works once within one hour', async ({ page, request }) => {
		const email = `reset-e2e-${Date.now()}@example.com`;
		const password = 'password123';

		await registerSeeker(page, email, password);

		await page.goto('/forgot-password');
		await page.getByLabel('Email').fill(email);
		await page.getByRole('button', { name: 'Send reset link' }).click();

		const tokenRes = await request.post('/api/dev/password-reset-token', { data: { email } });
		expect(tokenRes.ok()).toBe(true);
		const { data } = (await tokenRes.json()) as { data: { token: string } };

		await page.goto(`/reset-password?token=${data.token}`);
		await page.getByLabel('New password').fill('newpassword123');
		await page.getByLabel('Confirm password').fill('newpassword123');
		await page.getByRole('button', { name: 'Update password' }).click();
		await expect(page).toHaveURL(/\/sign-in\?reset=1/);

		await signInSeeker(page, email, 'newpassword123');

		await page.goto(`/reset-password?token=${data.token}`);
		await page.getByLabel('New password').fill('anotherpass123');
		await page.getByLabel('Confirm password').fill('anotherpass123');
		await page.getByRole('button', { name: 'Update password' }).click();
		await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
	});

	test('TC-ACC-03d: password change revokes other sessions', async ({ browser, request }) => {
		const email = `pwchange-${Date.now()}@example.com`;
		const password = 'password123';

		const contextA = await browser.newContext();
		const pageA = await contextA.newPage();
		await registerSeeker(pageA, email, password);

		const contextB = await browser.newContext();
		const pageB = await contextB.newPage();
		await signInSeeker(pageB, email, password);

		await pageA.goto('/profile');
		await pageA.getByLabel('Current password').fill(password);
		await pageA.getByLabel('New password', { exact: true }).fill('updatedpass123');
		await pageA.getByLabel('Confirm new password').fill('updatedpass123');
		await pageA.getByRole('button', { name: 'Update password' }).click();
		await expect(pageA.getByText('Password updated.')).toBeVisible();

		const cookiesB = await contextB.cookies();
		const sessionCookie = cookiesB.find((c) => c.name === 'pf_session');
		expect(sessionCookie).toBeTruthy();
		const pingB = await request.get('/api/session/ping', {
			headers: { cookie: `pf_session=${sessionCookie!.value}` }
		});
		expect(pingB.status()).toBe(401);

		await pageA.reload();
		await expect(pageA.getByText('E2E Seeker')).toBeVisible();

		await contextA.close();
		await contextB.close();
	});

	test('profile and reset screens have no critical or serious axe violations', async ({ page }) => {
		await page.goto('/profile');
		let results = await new AxeBuilder({ page }).analyze();
		let serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);

		await page.goto('/forgot-password');
		results = await new AxeBuilder({ page }).analyze();
		serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(serious).toEqual([]);
	});
});
