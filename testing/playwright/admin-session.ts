import { expect, type Page } from '@playwright/test';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } from '../../scripts/seed-core';

function isActionRedirect(status: number, body: string, location: string): boolean {
	return (
		status === 303 ||
		(status === 200 && /"type":"redirect"/.test(body) && body.includes(location))
	);
}

export async function signInAdminViaLoginForm(
	page: Page,
	input: { email?: string; password?: string; returnTo?: string } = {}
): Promise<void> {
	const email = input.email ?? SEED_ADMIN_EMAIL;
	const password = input.password ?? SEED_ADMIN_PASSWORD;
	const returnTo = input.returnTo ?? '/admin';
	await page.goto(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
	await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);

	const passwordRes = await page.request.post('/admin/login?/password', {
		form: { email, password, returnTo },
		maxRedirects: 0
	});
	const passwordBody = await passwordRes.text();
	expect(passwordRes.status(), passwordBody.slice(0, 400)).toBe(200);

	const totp = await page.request.get(`/api/dev/admin-totp-code?email=${encodeURIComponent(email)}`);
	expect(totp.ok(), await totp.text()).toBeTruthy();
	const { code } = (await totp.json()) as { code: string };
	expect(code.length).toBeGreaterThan(0);

	const verifyRes = await page.request.post('/admin/login?/totp', {
		form: { totpCode: code, returnTo },
		maxRedirects: 0
	});
	const verifyBody = await verifyRes.text();
	expect(isActionRedirect(verifyRes.status(), verifyBody, returnTo), verifyBody).toBe(true);
	await page.goto(returnTo);
}
