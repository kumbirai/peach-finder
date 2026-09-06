import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
