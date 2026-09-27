import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD } from '../../scripts/seed-core';
import { assertPrimaryListingLive } from './live-backend-assert';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'adminpass123';

async function signInAdmin(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
) {
	const login = await request.post('/admin/api/identity/login', {
		data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
	});
	expect(login.ok()).toBeTruthy();
	const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
	expect(loginBody.data.devTotpCode).toBeTruthy();

	const totp = await request.post('/admin/api/identity/login/totp', {
		data: { totpCode: loginBody.data.devTotpCode }
	});
	expect(totp.ok(), await totp.text()).toBeTruthy();

	const storage = await request.storageState();
	await page.context().addCookies(storage.cookies);
}

test.describe('US-ADMIN-06 tune platform without deploy', () => {
	test('TC-ADMIN-06a: config API change is live without restart', async ({ request }) => {
		const login = await request.post('/admin/api/identity/login', {
			data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
		});
		expect(login.ok()).toBeTruthy();
		const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
		const totp = await request.post('/admin/api/identity/login/totp', {
			data: { totpCode: loginBody.data.devTotpCode }
		});
		expect(totp.ok()).toBeTruthy();

		const before = await request.get('/admin/api/platform/config');
		expect(before.ok()).toBeTruthy();
		const beforeBody = (await before.json()) as {
			data: Array<{ key: string; value: number }>;
		};
		const current = beforeBody.data.find(
			(row) => row.key === 'direct-messaging.response_time_window_days'
		)?.value;
		const next = current === 30 ? 31 : 30;

		const put = await request.put(
			'/admin/api/platform/config/direct-messaging.response_time_window_days',
			{
				data: { value: next }
			}
		);
		expect(put.ok(), await put.text()).toBeTruthy();

		const after = await request.get('/admin/api/platform/config');
		const afterBody = (await after.json()) as {
			data: Array<{ key: string; value: number }>;
		};
		const saved = afterBody.data.find(
			(row) => row.key === 'direct-messaging.response_time_window_days'
		)?.value;
		expect(saved).toBe(next);

		await request.put('/admin/api/platform/config/direct-messaging.response_time_window_days', {
			data: { value: current ?? 30 }
		});
	});

	test('TC-ADMIN-06a: config save from console is used by billing without restart', async ({
		page,
		request,
		browser
	}) => {
		test.setTimeout(90_000);
		await signInAdmin(page, request);

		const before = await request.get('/admin/api/platform/config');
		expect(before.ok()).toBeTruthy();
		const beforeBody = (await before.json()) as {
			data: Array<{ key: string; value: number }>;
		};
		const current =
			beforeBody.data.find((row) => row.key === 'listing-billing.listing_price_cents')?.value ??
			9900;
		const next = current === 9900 ? 10100 : 9900;

		await page.goto('/admin/config');
		const field = page.getByTestId('config-field-listing-billing.listing_price_cents');
		await expect(field).toBeVisible();
		await field.getByLabel('Listing price (ZAR cents)').fill(String(next));
		await field.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('config-save-success')).toContainText(
			'listing-billing.listing_price_cents'
		);

		const after = await request.get('/admin/api/platform/config');
		const afterBody = (await after.json()) as {
			data: Array<{ key: string; value: number }>;
		};
		expect(
			afterBody.data.find((row) => row.key === 'listing-billing.listing_price_cents')?.value
		).toBe(next);

		const providerContext = await browser.newContext();
		try {
			const providerPage = await providerContext.newPage();
			await providerPage.goto('/sign-in?flow=sign-in&returnTo=/provider/billing');
			await providerPage.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
			await providerPage.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
			await providerPage.getByRole('button', { name: 'Sign in' }).click();
			await expect(providerPage).toHaveURL(/\/provider\/billing/, { timeout: 15_000 });

			const status = await providerPage.request.get('/api/billing/status');
			expect(status.ok()).toBeTruthy();
			const statusBody = (await status.json()) as { data: { listingPriceCents: number } };
			expect(statusBody.data.listingPriceCents).toBe(next);

			await expect(providerPage.getByTestId('billing-price-list')).toContainText(
				next === 10100 ? /R101/ : /R99/
			);
		} finally {
			await providerContext.close();
			await field.getByLabel('Listing price (ZAR cents)').fill(String(current));
			await field.getByRole('button', { name: 'Save' }).click();
			await expect(page.getByTestId('config-save-success')).toContainText(
				'listing-billing.listing_price_cents'
			);
		}
	});

	test('TC-ADMIN-06a: 5-minute TTL backstop refreshes a stale in-process cache', async ({
		page,
		request
	}) => {
		await signInAdmin(page, request);
		const before = await request.get('/admin/api/platform/config');
		const beforeBody = (await before.json()) as {
			data: Array<{ key: string; value: number }>;
		};
		const current =
			beforeBody.data.find((row) => row.key === 'listing-billing.listing_price_cents')?.value ??
			9900;
		const next = current === 9900 ? 10200 : 9900;

		await page.goto('/admin/config');
		const field = page.getByTestId('config-field-listing-billing.listing_price_cents');
		await field.getByLabel('Listing price (ZAR cents)').fill(String(next));
		await field.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('config-save-success')).toBeVisible();

		const stale = await request.post('/api/dev/config-ttl-backstop', {
			data: {
				action: 'stale',
				key: 'listing-billing.listing_price_cents',
				staleValue: current
			}
		});
		expect(stale.ok(), await stale.text()).toBeTruthy();
		const staleBody = (await stale.json()) as { data: { cached: number } };
		expect(staleBody.data.cached).toBe(current);

		const refresh = await request.post('/api/dev/config-ttl-backstop', {
			data: { action: 'refresh', key: 'listing-billing.listing_price_cents' }
		});
		expect(refresh.ok()).toBeTruthy();
		const refreshBody = (await refresh.json()) as { data: { cached: number } };
		expect(refreshBody.data.cached).toBe(next);

		await field.getByLabel('Listing price (ZAR cents)').fill(String(current));
		await field.getByRole('button', { name: 'Save' }).click();
	});

	test('TC-ADMIN-06b: cross-key validation rejects reminder lead >= expiry', async ({
		request
	}) => {
		const login = await request.post('/admin/api/identity/login', {
			data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
		});
		const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
		await request.post('/admin/api/identity/login/totp', {
			data: { totpCode: loginBody.data.devTotpCode }
		});

		const config = await request.get('/admin/api/platform/config');
		const body = (await config.json()) as {
			data: Array<{ key: string; value: number }>;
		};
		const expiry =
			body.data.find((row) => row.key === 'provider-availability.expiry_minutes')?.value ?? 240;

		const put = await request.put(
			'/admin/api/platform/config/provider-availability.reminder_lead_minutes',
			{ data: { value: expiry } }
		);
		expect(put.status()).toBe(422);
		const errorBody = (await put.json()) as { error: { message: string } };
		expect(errorBody.error.message.length).toBeGreaterThan(0);
	});

	test('platform config console exposes editable sections', async ({ page, request }) => {
		await signInAdmin(page, request);
		await page.goto('/admin/config');
		await expect(page.getByTestId('admin-platform-config')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Billing & pricing' })).toBeVisible();
		await expect(page.getByTestId('config-field-listing-billing.trial_period_days')).toBeVisible();
		await expect(page.getByTestId('service-tag-list')).toBeVisible();
		await expect(page.getByTestId('lexicon-list')).toBeVisible();
	});

	test('has no critical or serious axe violations on platform config', async ({
		page,
		request
	}) => {
		await signInAdmin(page, request);
		await page.goto('/admin/config');
		await assertPrimaryListingLive(page.request);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
