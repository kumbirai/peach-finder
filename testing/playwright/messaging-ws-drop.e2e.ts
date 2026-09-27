import { expect, test } from '@playwright/test';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';

async function registerAndVerifySeeker(
	page: import('@playwright/test').Page,
	email: string
): Promise<void> {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill('Ws Drop Seeker');
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
}

test.describe('LLD §2.5 WS drop poll fallback without duplicates', () => {
	test('a message sent after the socket drops appears once via poll', async ({ browser }) => {
		test.setTimeout(90_000);
		const providerContext = await browser.newContext();
		const seekerContext = await browser.newContext();
		const providerPage = await providerContext.newPage();
		const seekerPage = await seekerContext.newPage();

		await providerPage.addInitScript(() => {
			const Orig = window.WebSocket;
			const sockets: WebSocket[] = [];
			window.WebSocket = class extends Orig {
				constructor(url: string | URL, protocols?: string | string[]) {
					super(url, protocols);
					sockets.push(this);
				}
			} as typeof WebSocket;
			(
				window as Window & { __pfCloseSockets?: () => void }
			).__pfCloseSockets = () => {
				for (const socket of sockets) socket.close();
			};
		});

		const email = `ws-drop-${Date.now()}@example.com`;
		await registerAndVerifySeeker(seekerPage, email);
		await providerPage.goto('/sign-in?flow=sign-in&returnTo=/profile');
		await providerPage.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
		await providerPage.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
		await providerPage.getByRole('button', { name: 'Sign in' }).click();
		await expect(providerPage).toHaveURL(/\/profile/, { timeout: 15_000 });

		await seekerPage.goto(`/provider/${SEED_DUAL_ROLE_PROFILE_ID}`);
		await seekerPage
			.getByRole('group', { name: 'Contact actions' })
			.getByRole('link', { name: /^Message / })
			.click();
		await seekerPage.getByLabel('Your message').fill('Before drop');
		await seekerPage.getByRole('button', { name: 'Send message' }).click();
		await expect(seekerPage).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 15_000 });
		const threadId = seekerPage.url().split('/messages/')[1]!;

		await providerPage.goto(`/messages/${threadId}`);
		await expect(
			providerPage.getByTestId('message-bubble-inbound').filter({ hasText: 'Before drop' })
		).toBeVisible();

		await providerPage.evaluate(() => {
			(window as Window & { __pfCloseSockets?: () => void }).__pfCloseSockets?.();
		});

		await seekerPage.getByLabel('Write a message').fill('After socket drop');
		await seekerPage.getByRole('button', { name: 'Send' }).click();

		const inbound = providerPage
			.getByTestId('message-bubble-inbound')
			.filter({ hasText: 'After socket drop' });
		await expect(inbound).toBeVisible({ timeout: 20_000 });
		await expect(inbound).toHaveCount(1);

		await providerContext.close();
		await seekerContext.close();
	});
});
