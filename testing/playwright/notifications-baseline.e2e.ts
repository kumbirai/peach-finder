import { expect, test } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

async function fetchDevVerificationToken(
	request: import('@playwright/test').APIRequestContext,
	email: string
): Promise<string> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const tokenRes = await request.post('/api/dev/verification-token', { data: { email } });
		if (tokenRes.ok()) {
			const { data } = (await tokenRes.json()) as { data: { token: string } };
			return data.token;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Dev verification token unavailable for ${email}`);
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
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });

	const token = await fetchDevVerificationToken(request, email);
	await page.goto(`/verify-email?token=${token}&returnTo=/profile`);
	await Promise.all([
		expect(page).toHaveURL(/\/profile/, { timeout: 15_000 }),
		page.getByRole('button', { name: 'Verify email' }).click()
	]);
}

test.describe('US-NOTIF-01 baseline notification dispatch (live stack)', () => {
	test('TC-NOTIF-01a-live: report receipt creates an in-app notification', async ({ page }) => {
		const email = `e2e-notif-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Notif Seeker');

		const reportRes = await page.request.post('/api/trust/reports', {
			data: {
				targetType: 'profile',
				targetId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'spam_scam'
			}
		});
		expect(reportRes.status()).toBe(201);

		let found = false;
		for (let attempt = 0; attempt < 5 && !found; attempt++) {
			const dispatchRes = await page.request.post('/api/dev/notification-dispatch');
			expect(dispatchRes.ok()).toBeTruthy();

			const notifRes = await page.request.get('/api/notifications/in-app');
			expect(notifRes.ok()).toBeTruthy();
			const notifBody = (await notifRes.json()) as {
				data: Array<{ category: string; title: string }>;
			};
			found = notifBody.data.some((n) => n.category === 'report_receipt');
		}
		expect(found).toBeTruthy();
	});
});
