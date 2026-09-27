import { expect, test } from '@playwright/test';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_USER_ID
} from '../../scripts/seed-core';
import { SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD } from '../../scripts/seed-blocking-constants';

const AMARA_OWNER_ID = '01900000-0000-7000-8000-000000000001';
const DUAL_ROLE_DISPLAY_NAME = 'Jordan B.';

async function signIn(
	page: import('@playwright/test').Page,
	email: string,
	password: string
): Promise<void> {
	await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent('/profile')}`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 });
}

async function dispatchNotifications(request: import('@playwright/test').APIRequestContext) {
	for (let attempt = 0; attempt < 12; attempt++) {
		const dispatchRes = await request.post('/api/dev/notification-dispatch');
		if (!dispatchRes.ok()) {
			await new Promise((resolve) => setTimeout(resolve, 300));
			continue;
		}
		const body = (await dispatchRes.json()) as { data: { handled: number } };
		if (body.data.handled === 0) break;
	}
}

test.describe('LLD §2.11 window after flush', () => {
	test('a message after flush opens a second notification window', async ({ browser }) => {
		test.setTimeout(180_000);
		const seekerContext = await browser.newContext();
		const providerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const providerPage = await providerContext.newPage();

		await signIn(seekerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);
		await signIn(providerPage, SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD);
		await seekerPage.request.delete(`/api/trust/blocks/${AMARA_OWNER_ID}`);
		await providerPage.request.delete(`/api/trust/blocks/${SEED_DUAL_ROLE_USER_ID}`);
		await providerPage.request.post('/api/dev/notification-batch-flush', { data: {} });

		const threadRes = await seekerPage.request.post('/api/messaging/threads', {
			data: { providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID, body: 'Window one' }
		});
		expect(threadRes.ok()).toBeTruthy();
		const { data } = (await threadRes.json()) as { data: { threadId: string } };
		const threadId = data.threadId;

		await dispatchNotifications(seekerPage.request);
		const flush = await providerPage.request.post('/api/dev/notification-batch-flush', {
			data: {}
		});
		expect(flush.ok()).toBeTruthy();

		const afterFirst = await providerPage.request.get('/api/notifications/in-app?limit=50');
		const firstBody = (await afterFirst.json()) as {
			data: Array<{ category: string; title: string; deepLinkPath: string }>;
		};
		const firstWindow = firstBody.data.filter(
			(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
		);
		expect(firstWindow.length).toBeGreaterThanOrEqual(1);

		const secondSend = await seekerPage.request.post(`/api/messaging/threads/${threadId}/messages`, {
			data: { body: 'Window two after flush' }
		});
		expect(secondSend.ok()).toBeTruthy();
		await dispatchNotifications(seekerPage.request);

		const afterSecond = await providerPage.request.get('/api/notifications/in-app?limit=50');
		const secondBody = (await afterSecond.json()) as {
			data: Array<{ category: string; title: string; deepLinkPath: string }>;
		};
		const windows = secondBody.data.filter(
			(row) => row.category === 'new_message' && row.deepLinkPath === `/messages/${threadId}`
		);
		expect(windows.length).toBeGreaterThanOrEqual(2);
		expect(windows.some((row) => /Window one|new message from/i.test(row.title))).toBe(true);
		expect(
			windows.some((row) =>
				new RegExp(`new message from ${DUAL_ROLE_DISPLAY_NAME}`, 'i').test(row.title)
			)
		).toBe(true);

		await seekerContext.close();
		await providerContext.close();
	});
});
