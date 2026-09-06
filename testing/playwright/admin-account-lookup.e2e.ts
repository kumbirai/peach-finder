import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_CORE_PHONE_ON_NUMBER,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL
} from '../../scripts/seed-core';

async function signInAdmin(request: import('@playwright/test').APIRequestContext) {
	const login = await request.post('/admin/api/identity/login', {
		data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }
	});
	expect(login.ok()).toBeTruthy();
	const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
	const totp = await request.post('/admin/api/identity/login/totp', {
		data: { totpCode: loginBody.data.devTotpCode }
	});
	expect(totp.ok(), await totp.text()).toBeTruthy();
}

async function signInAdminPage(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
) {
	await signInAdmin(request);
	const storage = await request.storageState();
	await page.context().addCookies(storage.cookies);
}

test.describe('US-ADMIN-05 look up anyone, impersonate no one', () => {
	test('TC-ADMIN-05a: lookup by name, email, and phone via API', async ({ request }) => {
		await signInAdmin(request);

		const byName = await request.get('/admin/api/identity/accounts?q=Amara');
		expect(byName.ok()).toBeTruthy();
		const nameBody = (await byName.json()) as {
			data: { accounts: Array<{ displayName: string }> };
		};
		expect(nameBody.data.accounts.some((row) => row.displayName === 'Amara T.')).toBe(true);

		const byPhone = await request.get(
			`/admin/api/identity/accounts?q=${encodeURIComponent(SEED_CORE_PHONE_ON_NUMBER)}`
		);
		expect(byPhone.ok()).toBeTruthy();
		const phoneBody = (await byPhone.json()) as {
			data: { accounts: Array<{ displayName: string }> };
		};
		expect(phoneBody.data.accounts.some((row) => row.displayName === 'Amara T.')).toBe(true);

		const byEmail = await request.get(
			`/admin/api/identity/accounts?q=${encodeURIComponent(SEED_DUAL_ROLE_EMAIL)}`
		);
		expect(byEmail.ok()).toBeTruthy();
		const emailBody = (await byEmail.json()) as {
			data: { accounts: Array<{ email: string | null }> };
		};
		expect(emailBody.data.accounts.some((row) => row.email === SEED_DUAL_ROLE_EMAIL)).toBe(true);

		const billing = await request.get(
			`/admin/api/billing/subscription/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(billing.ok()).toBeTruthy();
		const billingBody = (await billing.json()) as { data: { listingLabel: string } };
		expect(billingBody.data.listingLabel).toBe('Active listing');
	});

	test('returns validation error for malformed billing profile id', async ({ request }) => {
		await signInAdmin(request);

		const billing = await request.get('/admin/api/billing/subscription/not-a-uuid');
		expect(billing.status()).toBe(422);
		const billingBody = (await billing.json()) as { error: { code: string } };
		expect(billingBody.error.code).toBe('VALIDATION_FAILED');
	});

	test('TC-ADMIN-05a: account page shows profile, badge, billing, and report summary', async ({
		page,
		request
	}) => {
		await signInAdminPage(page, request);
		await page.goto(`/admin/accounts?q=${encodeURIComponent('Amara')}`);
		await expect(page.getByTestId('admin-account-lookup')).toBeVisible();
		await expect(page.getByTestId('account-lookup-item').first()).toBeVisible();
		await expect(page.getByTestId('listing-state-chip').first()).toContainText('Active listing');
		await expect(page.getByTestId('account-summary-line').first()).toContainText(
			'Identity verified'
		);

		const reportHistory = page.getByTestId('account-report-history').first();
		await reportHistory.locator('summary').click();
		await expect(reportHistory.getByRole('heading', { name: 'Report history' })).toBeVisible();

		const billingState = page.getByTestId('account-billing-state').first();
		await billingState.locator('summary').click();
		await expect(
			billingState.getByRole('heading', { name: 'Billing / listing state' })
		).toBeVisible();
	});

	test('TC-ADMIN-05b: no impersonation affordance on accounts page', async ({ page, request }) => {
		await signInAdminPage(page, request);
		await page.goto('/admin/accounts');
		await expect(page.getByRole('button', { name: /log in as/i })).toHaveCount(0);
		await expect(page.getByRole('link', { name: /log in as/i })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /impersonat/i })).toHaveCount(0);
		await expect(page.getByRole('link', { name: /impersonat/i })).toHaveCount(0);
	});

	test('has no critical or serious axe violations on account lookup', async ({ page, request }) => {
		await signInAdminPage(page, request);
		await page.goto(`/admin/accounts?q=${encodeURIComponent('Amara')}`);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
