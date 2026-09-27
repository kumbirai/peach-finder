import { expect, test } from '@playwright/test';
import { signInSeeker } from '../seeker-session';
import { requirePersona } from './manifest';
import { isProductionBaseUrl, requiredEnvMessage } from './seed.config';

const DRAFT = 'Hi — are you free later today? Seeded live UI journey.';

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
	const blocked = requiredEnvMessage();
	expect(blocked, blocked ?? 'live UI environment is configured').toBeNull();
	expect(isProductionBaseUrl(), 'refusing production').toBeFalsy();
});

test('UI-seeded seeker finds UI-seeded provider and sends a live message', async ({ page }) => {
	test.setTimeout(120_000);
	const provider = requirePersona('ui-provider-available');
	const seeker = requirePersona('ui-seeker');
	expect(provider.profileId).toBeTruthy();
	const profileId = provider.profileId!;

	await signInSeeker(page, seeker.email, seeker.password, '/');
	await page.getByLabel('Search therapists').fill(provider.displayName);
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page).toHaveURL(/[?&]q=/);

	const card = page.locator(`a[href="/provider/${profileId}"]`).first();
	await expect(card).toBeVisible({ timeout: 15_000 });
	await card.click();
	await expect(page).toHaveURL(new RegExp(`/provider/${profileId}`));
	await expect(page.getByRole('heading', { level: 1, name: provider.displayName })).toBeVisible();

	await page
		.getByRole('group', { name: 'Contact actions' })
		.getByRole('link', { name: /^Message / })
		.click();
	await expect(page).toHaveURL(new RegExp(`/messages/compose/${profileId}|/messages/[0-9a-f-]{36}`));

	const compose = page.getByLabel('Your message');
	const reply = page.getByLabel('Write a message');
	if (await compose.isVisible().catch(() => false)) {
		await compose.fill(DRAFT);
		await page.getByRole('button', { name: 'Send message' }).click();
	} else {
		await reply.fill(DRAFT);
		await page.getByRole('button', { name: 'Send' }).click();
	}

	await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 15_000 });
	await expect(page.getByTestId('message-bubble-outbound').filter({ hasText: DRAFT })).toBeVisible();
	const threadId = new URL(page.url()).pathname.split('/messages/')[1]!;
	const persisted = await page.request.get(`/api/messaging/threads/${threadId}/messages`);
	expect(persisted.ok()).toBeTruthy();
	const persistedBody = (await persisted.json()) as {
		data: Array<{ body: string }> | { messages?: Array<{ body: string }> };
	};
	const messages = Array.isArray(persistedBody.data)
		? persistedBody.data
		: (persistedBody.data.messages ?? []);
	expect(messages.some((message) => message.body === DRAFT)).toBeTruthy();
});
