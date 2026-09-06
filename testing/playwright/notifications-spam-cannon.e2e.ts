import { expect, test } from '@playwright/test';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID,
	SEED_DUAL_ROLE_USER_ID
} from '../../scripts/seed-core';
import {
	SEED_SAFE02_AMARA_EMAIL,
	SEED_SAFE02_AMARA_PASSWORD,
	SEED_SAFE02_SEEKER_EMAIL,
	SEED_SAFE02_SEEKER_ID,
	SEED_SAFE02_SEEKER_PASSWORD
} from '../../scripts/seed-blocking-constants';

const DUAL_ROLE_DISPLAY_NAME = 'Jordan B.';
const AMARA_OWNER_ID = '01900000-0000-7000-8000-000000000001';

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

async function ensureUnblockedPair(
	seekerPage: import('@playwright/test').Page,
	providerPage: import('@playwright/test').Page,
	seekerId: string,
	providerId: string
): Promise<void> {
	await seekerPage.request.delete(`/api/trust/blocks/${providerId}`);
	await providerPage.request.delete(`/api/trust/blocks/${seekerId}`);
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

async function clearUnreadNewMessageNotifications(
	request: import('@playwright/test').APIRequestContext,
	threadId?: string
): Promise<void> {
	const listRes = await request.get('/api/notifications/in-app?limit=50');
	expect(listRes.ok()).toBeTruthy();
	const listBody = (await listRes.json()) as {
		data: Array<{ id: string; category: string; deepLinkPath: string }>;
	};
	const ids = listBody.data
		.filter(
			(row) =>
				row.category === 'new_message' &&
				(!threadId || row.deepLinkPath === `/messages/${threadId}`)
		)
		.map((row) => row.id);
	if (ids.length === 0) return;
	const readRes = await request.post('/api/notifications/in-app/read', { data: { ids } });
	expect(readRes.ok()).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.describe('US-NOTIF-03 never a spam cannon (live stack)', () => {
	test('TC-NOTIF-03a-live: burst messages collapse to one in-app notification', async ({
		browser
	}) => {
		test.setTimeout(180_000);

		const seekerContext = await browser.newContext();
		const providerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const providerPage = await providerContext.newPage();

		await signIn(seekerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);
		await signIn(providerPage, SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD);
		await ensureUnblockedPair(seekerPage, providerPage, SEED_DUAL_ROLE_USER_ID, AMARA_OWNER_ID);

		await flushNotificationBatches(providerPage.request);
		await clearUnreadNewMessageNotifications(providerPage.request);

		const threadRes = await seekerPage.request.post('/api/messaging/threads', {
			data: {
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				body: 'Burst message 1'
			}
		});
		expect(threadRes.ok()).toBeTruthy();
		const threadBody = (await threadRes.json()) as {
			data: { threadId: string; messageId: string };
		};
		const threadId = threadBody.data.threadId;

		for (let i = 2; i <= 6; i++) {
			const sendRes = await seekerPage.request.post(`/api/messaging/threads/${threadId}/messages`, {
				data: { body: `Burst message ${i}` }
			});
			expect(sendRes.ok()).toBeTruthy();
		}

		for (let attempt = 0; attempt < 8; attempt++) {
			await dispatchNotifications(seekerPage.request);
			const beforeFlushRes = await providerPage.request.get('/api/notifications/in-app');
			expect(beforeFlushRes.ok()).toBeTruthy();
			const beforeFlushBody = (await beforeFlushRes.json()) as {
				data: Array<{ category: string; title: string; deepLinkPath: string }>;
			};
			const newMessageRows = beforeFlushBody.data.filter(
				(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
			);
			if (newMessageRows.length === 1) {
				expect(newMessageRows[0]?.title).toMatch(/New message from/i);
				break;
			}
			if (attempt === 7) {
				expect(newMessageRows).toHaveLength(1);
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}

		await flushNotificationBatches(providerPage.request);

		const afterFlushRes = await providerPage.request.get('/api/notifications/in-app');
		expect(afterFlushRes.ok()).toBeTruthy();
		const afterFlushBody = (await afterFlushRes.json()) as {
			data: Array<{ category: string; title: string; deepLinkPath: string }>;
		};
		const collapsed = afterFlushBody.data.find(
			(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
		);
		expect(collapsed?.title).toBe(`6 new messages from ${DUAL_ROLE_DISPLAY_NAME}`);
		expect(collapsed?.deepLinkPath).toBe(`/messages/${threadId}`);

		await seekerContext.close();

		await providerPage.goto('/profile', { waitUntil: 'domcontentloaded' });
		await expect(providerPage.getByRole('heading', { name: 'Recent notifications' })).toBeVisible();
		await expect(providerPage.getByTestId('in-app-notifications-list')).toBeVisible();
		await expect(
			providerPage.getByText(`6 new messages from ${DUAL_ROLE_DISPLAY_NAME}`)
		).toBeVisible();

		await providerContext.close();
	});

	test('TC-NOTIF-03b-live: block silence prevents new notifications from blocked party', async ({
		browser
	}) => {
		test.setTimeout(90_000);

		const seekerContext = await browser.newContext();
		const providerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const providerPage = await providerContext.newPage();

		await signIn(seekerPage, SEED_SAFE02_SEEKER_EMAIL, SEED_SAFE02_SEEKER_PASSWORD);
		await signIn(providerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);
		await ensureUnblockedPair(
			seekerPage,
			providerPage,
			SEED_SAFE02_SEEKER_ID,
			SEED_DUAL_ROLE_USER_ID
		);

		await flushNotificationBatches(providerPage.request);
		await clearUnreadNewMessageNotifications(providerPage.request);

		const threadRes = await seekerPage.request.post('/api/messaging/threads', {
			data: {
				providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
				body: 'Before block'
			}
		});
		expect(threadRes.ok()).toBeTruthy();
		const threadBody = (await threadRes.json()) as { data: { threadId: string } };
		const threadId = threadBody.data.threadId;

		await dispatchNotifications(seekerPage.request);

		const beforeBlockRes = await providerPage.request.get('/api/notifications/in-app');
		expect(beforeBlockRes.ok()).toBeTruthy();
		const beforeBlockBody = (await beforeBlockRes.json()) as {
			data: Array<{ category: string; deepLinkPath: string }>;
		};
		const beforeCount = beforeBlockBody.data.filter(
			(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
		).length;
		expect(beforeCount).toBeGreaterThanOrEqual(1);

		await providerPage.goto(`/messages/${threadId}`);
		await providerPage.getByTestId('thread-safety-toggle').click();
		const panel = providerPage.getByTestId('thread-safety-panel');
		await panel.getByRole('button', { name: /^Block / }).click();
		await panel.getByRole('button', { name: 'Confirm block' }).click();

		const blockedSend = await seekerPage.request.post(
			`/api/messaging/threads/${threadId}/messages`,
			{ data: { body: 'Should not notify after block' } }
		);
		expect(blockedSend.status()).toBe(404);

		await dispatchNotifications(seekerPage.request);

		const afterBlockRes = await providerPage.request.get('/api/notifications/in-app');
		expect(afterBlockRes.ok()).toBeTruthy();
		const afterBlockBody = (await afterBlockRes.json()) as {
			data: Array<{ category: string; deepLinkPath: string }>;
		};
		const afterCount = afterBlockBody.data.filter(
			(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
		).length;
		expect(afterCount).toBe(beforeCount);

		await seekerContext.close();
		await providerContext.close();
	});
});
