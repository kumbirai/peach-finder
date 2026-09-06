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
	expect(
		loginBody.data.devTotpCode,
		'devTotpCode from login when ALLOW_DEV_HELPERS=1'
	).toBeTruthy();

	const totp = await request.post('/admin/api/identity/login/totp', {
		data: { totpCode: loginBody.data.devTotpCode }
	});
	expect(totp.ok(), await totp.text()).toBeTruthy();

	const storage = await request.storageState();
	await page.context().addCookies(storage.cookies);
	await page.goto('/admin');
	await expect(page.getByRole('navigation', { name: 'Admin console sections' })).toBeVisible();
}

test.describe('US-ADMIN-01 hardened admin console', () => {
	test('TC-ADMIN-01a: unauthenticated admin API stays forbidden', async ({ request }) => {
		const res = await request.get('/admin/api/platform/config');
		expect(res.status()).toBe(401);
	});

	test('TC-ADMIN-01a: enrollment gate blocks password-only access', async ({ request }) => {
		const login = await request.post('/admin/api/identity/login', {
			data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
		});
		expect(login.ok()).toBeTruthy();
		const payload = (await login.json()) as { data: { step: string } };
		expect(payload.data.step).toBe('totp');

		const blocked = await request.post('/admin/api/identity/login/totp', {
			data: { totpCode: '000000' }
		});
		expect([403, 429]).toContain(blocked.status());
	});

	test('TC-ADMIN-VIS-01: admin strip uses Ink within the console only', async ({
		page,
		request
	}) => {
		await page.goto('/');
		await expect(page.locator('[data-admin-ink-strip]')).toHaveCount(0);

		await signInAdmin(page, request);
		const strip = page.locator('[data-admin-ink-strip]');
		await expect(strip).toBeVisible();
		const background = await strip.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(background).toMatch(/rgb\(43,\s*38,\s*34\)|rgb\(43, 38, 34\)/);
	});

	test('admin console exposes section navigation after sign-in', async ({ page, request }) => {
		await signInAdmin(page, request);
		const nav = page.getByRole('navigation', { name: 'Admin console sections' });
		await expect(nav.getByRole('link', { name: 'Identity queue' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Reports queue' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Accounts' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Platform config' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Audit log' })).toBeVisible();
	});

	test('has no critical or serious axe violations on admin login', async ({ page }) => {
		await page.goto('/admin/login');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
