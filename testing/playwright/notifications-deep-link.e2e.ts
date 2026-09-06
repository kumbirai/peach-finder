import { expect, test } from '@playwright/test';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_USER_ID
} from '../../scripts/seed-core';
import {
	SEED_SAFE02_AMARA_EMAIL,
	SEED_SAFE02_AMARA_PASSWORD
} from '../../scripts/seed-blocking-constants';

async function signIn(
	page: import('@playwright/test').Page,
	email: string,
	password: string,
	returnTo = '/profile'
): Promise<void> {
	await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent(returnTo)}`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 });
}

async function dispatchNotifications(
	request: import('@playwright/test').APIRequestContext
): Promise<void> {
	for (let attempt = 0; attempt < 12; attempt++) {
		const dispatchRes = await request.post('/api/dev/notification-dispatch');
		if (!dispatchRes.ok()) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			continue;
		}
		const body = (await dispatchRes.json()) as { data: { handled: number } };
		if (body.data.handled === 0) break;
	}
}

async function flushNotificationBatches(
	request: import('@playwright/test').APIRequestContext
): Promise<void> {
	const flushRes = await request.post('/api/dev/notification-batch-flush', { data: {} });
	expect(flushRes.ok()).toBeTruthy();
}

async function clearUnreadNotifications(
	request: import('@playwright/test').APIRequestContext
): Promise<void> {
	const listRes = await request.get('/api/notifications/in-app?limit=50');
	if (!listRes.ok()) return;
	const listBody = (await listRes.json()) as { data: Array<{ id: string }> };
	const ids = listBody.data.map((row) => row.id);
	if (ids.length === 0) return;
	await request.post('/api/notifications/in-app/read', { data: { ids } });
}

test.describe('US-NOTIF-04 every notification lands me where I act (live stack)', () => {
	test('TC-NOTIF-04a-live: message and billing notifications deep-link to thread and billing', async ({
		browser
	}) => {
		test.setTimeout(180_000);

		const seekerContext = await browser.newContext();
		const providerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const providerPage = await providerContext.newPage();

		await signIn(seekerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD, '/profile');
		await signIn(providerPage, SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD, '/profile');

		await seekerPage.request.delete(`/api/trust/blocks/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await providerPage.request.delete(`/api/trust/blocks/${SEED_DUAL_ROLE_USER_ID}`);

		await flushNotificationBatches(providerPage.request);
		await clearUnreadNotifications(providerPage.request);
		await clearUnreadNotifications(seekerPage.request);

		const threadRes = await seekerPage.request.post('/api/messaging/threads', {
			data: {
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				body: 'Deep link e2e message'
			}
		});
		expect(threadRes.ok(), await threadRes.text()).toBeTruthy();
		const threadBody = (await threadRes.json()) as { data: { threadId: string } };
		const threadId = threadBody.data.threadId;

		await dispatchNotifications(seekerPage.request);

		const providerNotifRes = await providerPage.request.get('/api/notifications/in-app?limit=50');
		expect(providerNotifRes.ok()).toBeTruthy();
		const providerNotifBody = (await providerNotifRes.json()) as {
			data: Array<{
				id: string;
				category: string;
				deepLinkPath: string;
				actionLabel: string;
				openHref: string;
			}>;
		};

		const messageNotification = providerNotifBody.data.find(
			(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
		);
		expect(messageNotification).toBeTruthy();
		expect(messageNotification?.actionLabel).toBe('Open thread');

		await providerPage.goto('/profile');
		const messageCard = providerPage.locator(
			`[data-testid="in-app-notification-${messageNotification!.id}"]`
		);
		await expect(messageCard).toBeVisible({ timeout: 15_000 });
		await expect(messageCard).toHaveAttribute('data-deep-link-path', `/messages/${threadId}`);
		await expect(messageCard.getByText('Open thread')).toBeVisible();

		const messageOpenRes = await providerPage.request.get(messageNotification!.openHref, {
			maxRedirects: 0
		});
		expect(messageOpenRes.status()).toBe(303);
		expect(messageOpenRes.headers().location).toBe(`/messages/${threadId}`);

		const threadMessagesRes = await providerPage.request.get(
			`/api/messaging/threads/${threadId}/messages`
		);
		expect(threadMessagesRes.ok(), await threadMessagesRes.text()).toBeTruthy();

		const paidSeed = await seekerPage.request.post('/api/dev/billing-paid-listing', { data: {} });
		expect(paidSeed.ok(), await paidSeed.text()).toBeTruthy();

		const trialEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
		const graceSeed = await seekerPage.request.post('/api/dev/billing-seed-lifecycle', {
			data: { state: 'free_listed', trialEndsAt }
		});
		expect(graceSeed.ok(), await graceSeed.text()).toBeTruthy();

		const trialDispatch = await seekerPage.request.post('/api/dev/trial-ending-dispatch', {
			data: {}
		});
		expect(trialDispatch.ok(), await trialDispatch.text()).toBeTruthy();

		const billingNotifRes = await seekerPage.request.get('/api/notifications/in-app?limit=50');
		expect(billingNotifRes.ok()).toBeTruthy();
		const billingNotifBody = (await billingNotifRes.json()) as {
			data: Array<{
				id: string;
				category: string;
				deepLinkPath: string;
				actionLabel: string;
				openHref: string;
			}>;
		};

		const billingNotification = billingNotifBody.data.find(
			(row) =>
				row.deepLinkPath === '/provider/billing' &&
				(row.category === 'billing_trial_ending' ||
					row.category === 'billing_payment' ||
					row.category === 'billing_grace')
		);
		expect(billingNotification).toBeTruthy();
		expect(billingNotification?.deepLinkPath).toBe('/provider/billing');
		expect(billingNotification?.actionLabel).toBe('Manage billing');

		await seekerPage.goto('/profile');
		const billingCard = seekerPage.locator(
			`[data-testid="in-app-notification-${billingNotification!.id}"]`
		);
		await expect(billingCard).toBeVisible({ timeout: 15_000 });
		await expect(billingCard.getByText('Manage billing')).toBeVisible();

		const billingOpenRes = await seekerPage.request.get(billingNotification!.openHref, {
			maxRedirects: 0
		});
		expect(billingOpenRes.status()).toBe(303);
		expect(billingOpenRes.headers().location).toBe('/provider/billing');

		const billingStatusRes = await seekerPage.request.get('/api/billing/status');
		expect(billingStatusRes.ok(), await billingStatusRes.text()).toBeTruthy();

		await seekerContext.close();
		await providerContext.close();
	});
});
