import { expect, test } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

test.describe('LLD §2.11 channel failure isolation', () => {
	test('filing a report still succeeds and lands in-app when email is forced to fail', async ({
		page
	}) => {
		test.setTimeout(90_000);
		const email = `channel-iso-${Date.now()}@example.com`;
		await page.goto('/sign-in?returnTo=/profile');
		await page.getByLabel('Your name').fill('Channel Iso');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
		let tokenRes = await page.request.post('/api/dev/verification-token', { data: { email } });
		if (!tokenRes.ok()) {
			await page.waitForTimeout(400);
			tokenRes = await page.request.post('/api/dev/verification-token', { data: { email } });
		}
		const { data } = (await tokenRes.json()) as { data: { token: string } };
		await page.goto(`/verify-email?token=${data.token}&returnTo=/profile`);
		await page.getByRole('button', { name: 'Verify email' }).click();
		await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });

		const arm = await page.request.post('/api/dev/notification-fail-next-email');
		expect(arm.ok()).toBeTruthy();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}/report`);
		const filed = await page.request.post('/api/trust/reports', {
			data: {
				targetType: 'profile',
				targetId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'spam_scam'
			}
		});
		expect(filed.status(), await filed.text()).toBe(201);

		for (let attempt = 0; attempt < 10; attempt++) {
			const dispatch = await page.request.post('/api/dev/notification-dispatch');
			if (dispatch.ok()) {
				const body = (await dispatch.json()) as { data: { handled: number } };
				if (body.data.handled === 0) break;
			}
		}

		const list = await page.request.get('/api/notifications/in-app?limit=20');
		expect(list.ok()).toBeTruthy();
		const listBody = (await list.json()) as { data: Array<{ category: string }> };
		expect(listBody.data.some((row) => row.category === 'report_receipt')).toBe(true);
	});
});
