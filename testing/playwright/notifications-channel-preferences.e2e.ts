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

test.describe('US-NOTIF-02 channel preferences (live stack)', () => {
	test('TC-NOTIF-02a-live: non-essential opt-out honored via API and profile UI', async ({
		page
	}) => {
		const email = `e2e-notif-pref-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Pref Seeker');

		await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

		const disablePush = await page.request.put('/api/notifications/preferences', {
			data: {
				updates: [{ category: 'new_message', channel: 'push', enabled: false }]
			}
		});
		expect(disablePush.ok()).toBeTruthy();

		const prefsRes = await page.request.get('/api/notifications/preferences');
		expect(prefsRes.ok()).toBeTruthy();
		const prefsBody = (await prefsRes.json()) as {
			data: {
				categories: Array<{
					id: string;
					channels: Array<{ id: string; enabled: boolean }>;
				}>;
			};
		};
		const newMessage = prefsBody.data.categories.find((category) => category.id === 'new_message');
		expect(newMessage?.channels.find((channel) => channel.id === 'push')?.enabled).toBe(false);
		expect(newMessage?.channels.find((channel) => channel.id === 'email')?.enabled).toBe(true);
		expect(newMessage?.channels.find((channel) => channel.id === 'in_app')?.enabled).toBe(true);

		await page.reload();
		const pushToggle = page.getByTestId('notif-toggle-new_message-push');
		await expect(pushToggle).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByTestId('notif-toggle-new_message-email')).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});

	test('TC-NOTIF-02b-live: essential billing category stays always on in UI and API', async ({
		page
	}) => {
		const email = `e2e-notif-essential-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Essential Seeker');

		await expect(page.getByText('Always delivered').first()).toBeVisible();

		const billingToggle = page.getByTestId('notif-toggle-billing_payment-email');
		await expect(billingToggle).toBeDisabled();
		await expect(billingToggle).toHaveAttribute('aria-checked', 'true');

		const rejectRes = await page.request.put('/api/notifications/preferences', {
			data: {
				updates: [{ category: 'billing_payment', channel: 'email', enabled: false }]
			}
		});
		expect(rejectRes.status()).toBe(422);
	});

	test('TC-NOTIF-02a-live-dispatch: report receipt still delivers after silencing new messages', async ({
		page
	}) => {
		const email = `e2e-notif-dispatch-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Dispatch Seeker');

		const disableInApp = await page.request.put('/api/notifications/preferences', {
			data: {
				updates: [{ category: 'new_message', channel: 'in_app', enabled: false }]
			}
		});
		expect(disableInApp.ok()).toBeTruthy();

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
				data: Array<{ category: string }>;
			};
			found = notifBody.data.some((n) => n.category === 'report_receipt');
		}
		expect(found).toBeTruthy();
	});
});
