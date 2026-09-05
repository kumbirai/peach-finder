import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';

function isProfilePage(url: string): boolean {
	return new URL(url).pathname === '/profile';
}

async function expectProfilePage(
	page: import('@playwright/test').Page,
	timeout = 15_000
): Promise<void> {
	await expect(page).toHaveURL(isProfilePage, { timeout });
}

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
	await expectProfilePage(page);

	const token = await fetchDevVerificationToken(request, email);
	await page.goto(`/verify-email?token=${token}&returnTo=/profile`);
	await Promise.all([
		expectProfilePage(page),
		page.getByRole('button', { name: 'Verify email' }).click()
	]);
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/profile');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expectProfilePage(page);
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

test.describe('US-MSG-03 quick-start prompts', () => {
	test('TC-MSG-03a: quick-start prompt inserts plain editable text into composer', async ({
		page
	}) => {
		const email = `msg03a-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Msg03a Seeker');
		await openThreadWithProvider(page, SEED_CORE_PRIMARY_PROFILE_ID, 'Opening message');

		const composer = page.getByLabel('Write a message');
		await expect(composer).toHaveValue('');
		const outboundBefore = await page.getByTestId('message-bubble-outbound').count();

		const promptButton = page.getByRole('button', { name: 'Are you available today?' });
		await expect(promptButton).toBeVisible();
		await promptButton.click();
		await expect(page.getByTestId('message-bubble-outbound')).toHaveCount(outboundBefore);
		await expect(composer).toHaveValue('Are you available today?');
		await expect(composer).toBeEditable();

		await composer.fill('Are you available today at 3pm?');
		await expect(composer).toHaveValue('Are you available today at 3pm?');
	});

	test('TC-MSG-03b: thread view has no booking widgets or structured controls', async ({
		page
	}) => {
		const email = `msg03b-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, page.request, email, 'password123', 'Msg03b Seeker');
		await openThreadWithProvider(page, SEED_CORE_PRIMARY_PROFILE_ID, 'Checking UI');

		await expect(page.getByRole('group', { name: 'Quick-start prompts' })).toBeVisible();
		await expect(page.getByRole('spinbutton')).toHaveCount(0);
		await expect(page.getByRole('combobox')).toHaveCount(0);
		await expect(page.locator('[data-booking], [data-slot-picker]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /confirm booking/i })).toHaveCount(0);
	});
});

test.describe('US-MSG-04 inbox at a glance', () => {
	test('TC-MSG-04a: thread list ordering, unread flags, and chrome badge', async ({ browser }) => {
		const providerContext = await browser.newContext();
		const seekerContext = await browser.newContext();
		const providerPage = await providerContext.newPage();
		const seekerPage = await seekerContext.newPage();

		const seekerEmail = `msg04a-${Date.now()}@example.com`;
		await registerAndVerifySeeker(
			seekerPage,
			seekerPage.request,
			seekerEmail,
			'password123',
			'Msg04a Seeker'
		);
		await signIn(providerPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);

		const olderThreadId = await openThreadWithProvider(
			seekerPage,
			SEED_DUAL_ROLE_PROFILE_ID,
			'Older thread first'
		);

		const sendRes = await providerPage.request.post(
			`/api/messaging/threads/${olderThreadId}/messages`,
			{ data: { body: 'Unread provider reply for seeker' } }
		);
		expect(sendRes.ok()).toBeTruthy();

		await openThreadWithProvider(seekerPage, SEED_CORE_PRIMARY_PROFILE_ID, 'Newer thread second');

		await seekerPage.goto('/messages');
		const items = seekerPage.getByTestId('thread-list-item');
		await expect(items.first()).toContainText('Newer thread second');
		await expect(items.nth(1)).toContainText('Unread provider reply for seeker');
		await expect(items.filter({ hasText: 'Jordan B.' }).getByTestId('unread-badge')).toBeVisible();
		await expect(
			seekerPage.getByRole('link', { name: /Messages/ }).getByTestId('unread-badge')
		).toBeVisible();

		await providerContext.close();
		await seekerContext.close();
	});
});
