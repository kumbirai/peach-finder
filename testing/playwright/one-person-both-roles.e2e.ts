import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROVIDER_INBOX_PREVIEW,
	SEED_DUAL_ROLE_SEEKER_THREAD_PREVIEW
} from '../../scripts/seed-core';

async function signInDualRole(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?returnTo=/messages&flow=sign-in');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.locator('form button[type="submit"]').click();
	await expect(page).toHaveURL(/\/messages/);
}

test.describe('US-ACC-04 one person both roles', () => {
	test('TC-ACC-04a: explicit role switch with no data co-mingling', async ({ page }) => {
		await signInDualRole(page);

		await expect(page.getByRole('group', { name: 'Switch role' })).toBeVisible();
		await expect(page.getByText(SEED_DUAL_ROLE_SEEKER_THREAD_PREVIEW)).toBeVisible();
		await expect(page.getByText('Great Swedish session — seeker review only.')).toBeVisible();
		await expect(page.getByText(SEED_DUAL_ROLE_PROVIDER_INBOX_PREVIEW)).not.toBeVisible();

		await page.getByRole('link', { name: 'Provider', exact: true }).click();
		await expect(page).toHaveURL(/\/provider\/dashboard/);
		await expect(page.getByText(SEED_DUAL_ROLE_PROVIDER_INBOX_PREVIEW)).toBeVisible();
		await expect(page.getByText('Profile views')).toBeVisible();
		await expect(page.getByText(SEED_DUAL_ROLE_SEEKER_THREAD_PREVIEW)).not.toBeVisible();
		await expect(page.getByText('Great Swedish session — seeker review only.')).not.toBeVisible();

		await page.getByRole('link', { name: 'Seeker', exact: true }).click();
		await expect(page).toHaveURL(/\/messages/);
		await expect(page.getByText(SEED_DUAL_ROLE_SEEKER_THREAD_PREVIEW)).toBeVisible();

		const capsRes = await page.request.get('/api/identity/me/capabilities');
		expect(capsRes.ok()).toBe(true);
		const caps = (await capsRes.json()) as {
			data: { isSeeker: boolean; isProvider: boolean };
		};
		expect(caps.data.isSeeker).toBe(true);
		expect(caps.data.isProvider).toBe(true);
	});

	test('provider dashboard returns 403 for seeker-only accounts', async ({ page, request }) => {
		const email = `seeker-only-${Date.now()}@example.com`;
		await page.goto('/sign-in?returnTo=/profile');
		await page.getByLabel('Your name').fill('Seeker Only');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/profile/);

		const cookies = await page.context().cookies();
		const session = cookies.find((c) => c.name === 'pf_session');
		expect(session).toBeTruthy();

		const dash = await request.get('/provider/dashboard', {
			headers: { cookie: `pf_session=${session!.value}` }
		});
		expect(dash.status()).toBe(403);
	});

	test('role switch surfaces have no critical or serious axe violations', async ({ page }) => {
		await signInDualRole(page);

		let results = await new AxeBuilder({ page }).analyze();
		let serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);

		await page.getByRole('link', { name: 'Provider', exact: true }).click();
		results = await new AxeBuilder({ page }).analyze();
		serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(serious).toEqual([]);
	});
});
