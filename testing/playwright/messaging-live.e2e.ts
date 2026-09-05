import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';

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

	const tokenRes = await request.post('/api/dev/verification-token', { data: { email } });
	if (!tokenRes.ok()) {
		await page.waitForTimeout(500);
		const retry = await request.post('/api/dev/verification-token', { data: { email } });
		expect(retry.ok()).toBe(true);
		const retryData = (await retry.json()) as { data: { token: string } };
		await page.goto(`/verify-email?token=${retryData.data.token}&returnTo=/profile`);
	} else {
		const { data } = (await tokenRes.json()) as { data: { token: string } };
		await page.goto(`/verify-email?token=${data.token}&returnTo=/profile`);
	}
	await page.getByRole('button', { name: 'Verify email' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/profile');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
}

async function openThreadWithProvider(
	seekerPage: import('@playwright/test').Page,
	providerProfileId: string,
	firstMessage: string
): Promise<string> {
	await seekerPage.goto(`/provider/${providerProfileId}`);
	await seekerPage
		.getByRole('group', { name: 'Contact actions' })
		.getByRole('link', { name: /^Message / })
		.click();
	await seekerPage.getByLabel('Your message').fill(firstMessage);
	await seekerPage.getByRole('button', { name: 'Send message' }).click();
	await expect(seekerPage).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 15_000 });
	return seekerPage.url().split('/messages/')[1]!;
}

test.describe('US-MSG-02 live conversation', () => {
	test.describe.configure({ mode: 'serial' });

	test('TC-MSG-02a: message arrives to online counterpart without manual refresh', async ({
		browser
	}) => {
		const providerContext = await browser.newContext();
		const seekerContext = await browser.newContext();
		const providerPage = await providerContext.newPage();
		const seekerPage = await seekerContext.newPage();

		const seekerEmail = `msg02a-${Date.now()}@example.com`;
		await registerAndVerifySeeker(
			seekerPage,
			seekerPage.request,
			seekerEmail,
			'password123',
			'Msg02a Seeker'
		);
		await signIn(providerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);

		const threadId = await openThreadWithProvider(
			seekerPage,
			SEED_DUAL_ROLE_PROFILE_ID,
			'Opening message'
		);

		await providerPage.goto(`/messages/${threadId}`);
		await expect(
			providerPage.getByTestId('message-bubble-inbound').filter({ hasText: 'Opening message' })
		).toBeVisible();

		await seekerPage.getByLabel('Write a message').fill('Are you free this afternoon?');
		await seekerPage.getByRole('button', { name: 'Send' }).click();

		await expect(
			providerPage.getByTestId('message-bubble-inbound').filter({
				hasText: 'Are you free this afternoon?'
			})
		).toBeVisible({ timeout: 3000 });

		await providerContext.close();
		await seekerContext.close();
	});

	test('TC-MSG-02b: sent/delivered/read states update live for sender', async ({ browser }) => {
		const providerContext = await browser.newContext();
		const seekerContext = await browser.newContext();
		const providerPage = await providerContext.newPage();
		const seekerPage = await seekerContext.newPage();

		const seekerEmail = `msg02b-${Date.now()}@example.com`;
		await registerAndVerifySeeker(
			seekerPage,
			seekerPage.request,
			seekerEmail,
			'password123',
			'Msg02b Seeker'
		);
		await signIn(providerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);

		const threadId = await openThreadWithProvider(
			seekerPage,
			SEED_DUAL_ROLE_PROFILE_ID,
			'Delivery state check'
		);

		const deliveryState = seekerPage.getByTestId('message-delivery-state').first();
		await expect(deliveryState).toContainText('Sent');

		await providerPage.goto(`/messages/${threadId}`);
		await expect(
			providerPage.getByTestId('message-bubble-inbound').filter({ hasText: 'Delivery state check' })
		).toBeVisible({ timeout: 5000 });

		await expect(deliveryState).toContainText(/Delivered|Read/, { timeout: 5000 });

		await providerContext.close();
		await seekerContext.close();
	});

	test('TC-MSG-02c: polling fallback still delivers messages', async ({ browser }) => {
		const providerContext = await browser.newContext();
		const seekerContext = await browser.newContext();
		const providerPage = await providerContext.newPage();
		const seekerPage = await seekerContext.newPage();

		const seekerEmail = `msg02c-${Date.now()}@example.com`;
		await registerAndVerifySeeker(
			seekerPage,
			seekerPage.request,
			seekerEmail,
			'password123',
			'Msg02c Seeker'
		);
		await signIn(providerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);

		const threadId = await openThreadWithProvider(
			seekerPage,
			SEED_DUAL_ROLE_PROFILE_ID,
			'First message'
		);

		await providerPage.goto(`/messages/${threadId}?forcePolling=1`);
		await expect(providerPage.getByText(/Reconnecting/)).toBeVisible();

		await seekerPage.getByLabel('Write a message').fill('Polling fallback check');
		await seekerPage.getByRole('button', { name: 'Send' }).click();

		await expect(
			providerPage
				.getByTestId('message-bubble-inbound')
				.filter({ hasText: 'Polling fallback check' })
		).toBeVisible({ timeout: 10_000 });

		await providerContext.close();
		await seekerContext.close();
	});

	test('thread view has no critical or serious axe violations', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const email = `msg02-axe-${Date.now()}@example.com`;

		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Msg02 Axe');
		await openThreadWithProvider(page, SEED_CORE_PRIMARY_PROFILE_ID, 'Accessibility check');

		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);

		await context.close();
	});
});
