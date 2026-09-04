import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../scripts/seed-core';

async function signIn(
	page: import('@playwright/test').Page,
	email: string,
	password: string,
	returnTo = '/profile'
) {
	await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}&flow=sign-in`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(new RegExp(returnTo.replace('/', '\\/')));
}

async function registerAndVerifySeeker(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext,
	email: string,
	password: string,
	name: string
) {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/profile/);

	const tokenRes = await request.post('/api/dev/verification-token', { data: { email } });
	expect(tokenRes.ok()).toBe(true);
	const { data } = (await tokenRes.json()) as { data: { token: string } };
	await page.goto(`/verify-email?token=${data.token}&returnTo=/profile`);
	await page.getByRole('button', { name: 'Verify email' }).click();
	await expect(page).toHaveURL(/\/profile/);
}

test.describe.configure({ mode: 'serial' });

test.describe('US-ACC-05 delete my account', () => {
	test('TC-ACC-05a: deletion requires a confirmation step', async ({ page, request }) => {
		const email = `confirm-step-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, request, email, 'password123', 'Confirm Step User');

		await page.getByRole('heading', { name: 'Delete account' }).scrollIntoViewIfNeeded();
		await expect(page.getByText(/billing, tax, and moderation records/i)).toBeVisible();
		await expect(page.getByText(/enter your password to confirm/i)).not.toBeVisible();
		await page.getByRole('link', { name: 'Delete my account' }).click();
		await expect(page).toHaveURL(/deleteConfirm=1/);
		await expect(page.getByText(/enter your password to confirm/i)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Yes, delete my account' })).toBeEnabled();
	});

	test('TC-ACC-05c: provider inbox shows Deleted account after seeker deletes', async ({
		page,
		request
	}) => {
		const email = `seeker-delete-${Date.now()}@example.com`;
		const password = 'password123';
		const messageBody = `Message before account deletion ${Date.now()}`;

		await registerAndVerifySeeker(page, request, email, password, 'Seeker Delete E2E');

		const composeRes = await page.request.post('/api/messaging/threads', {
			data: {
				providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
				body: messageBody
			}
		});
		expect(composeRes.ok()).toBe(true);

		await page.goto('/profile?deleteConfirm=1');
		const deleteRes = await page.request.delete('/api/identity/account', {
			data: { password, confirm: true }
		});
		expect(deleteRes.ok()).toBe(true);

		await signIn(page, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD, '/provider/dashboard');
		const inbox = page.locator('section').filter({
			has: page.getByRole('heading', { name: 'Messages from seekers' })
		});
		const thread = inbox.locator('li').filter({ hasText: messageBody });
		await expect(thread.getByText('Deleted account')).toBeVisible();
		await expect(thread.getByText(messageBody)).toBeVisible();
	});

	test('profile delete section has no critical or serious axe violations', async ({
		page,
		request
	}) => {
		const email = `axe-delete-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, request, email, 'password123', 'Axe Delete User');
		await page.goto('/profile?deleteConfirm=1');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});

	test('TC-ACC-05b: provider deletion unpublishes immediately', async ({ page, request }) => {
		await signIn(page, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);

		const beforeProfile = await request.get(`/api/provider/profile/${SEED_DUAL_ROLE_PROFILE_ID}`);
		expect(beforeProfile.ok()).toBe(true);

		const before = await request.get('/api/discovery/search');
		const beforeBody = (await before.json()) as { data: Array<{ providerProfileId: string }> };
		expect(beforeBody.data.map((r) => r.providerProfileId)).toContain(SEED_DUAL_ROLE_PROFILE_ID);

		await page.goto('/profile?deleteConfirm=1');
		const deleteRes = await page.request.delete('/api/identity/account', {
			data: { password: SEED_DUAL_ROLE_PASSWORD, confirm: true }
		});
		expect(deleteRes.ok()).toBe(true);

		const after = await request.get('/api/discovery/search');
		const afterBody = (await after.json()) as { data: Array<{ providerProfileId: string }> };
		expect(afterBody.data.map((r) => r.providerProfileId)).not.toContain(SEED_DUAL_ROLE_PROFILE_ID);

		const afterProfile = await request.get(`/api/provider/profile/${SEED_DUAL_ROLE_PROFILE_ID}`);
		expect(afterProfile.status()).toBe(404);
	});
});
