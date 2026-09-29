import { expect, test } from '@playwright/test';
import { signInSeeker } from '../seeker-session';
import { requirePersona } from './manifest';
import { isProductionBaseUrl, requiredEnvMessage } from './seed.config';

const draftBody = () =>
	`Hi — are you free later today? Seeded live UI journey ${Date.now()}.`;
const PUBLISH_INTRO_SEARCH = 'sports recovery';

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

	const verifyRes = await page.request.post('/api/dev/verify-email', { data: { email: seeker.email } });
	expect(verifyRes.ok(), await verifyRes.text()).toBeTruthy();
	const verifyBody = (await verifyRes.json()) as { data: { verified: boolean } };
	expect(verifyBody.data.verified).toBe(true);

	await signInSeeker(page, seeker.email, seeker.password, '/');
	await page.getByLabel('Search therapists').fill(PUBLISH_INTRO_SEARCH);
	await page.getByRole('button', { name: 'Search' }).click();
	const card = page.locator(`a[href="/provider/${profileId}"]`).first();
	await expect(card).toBeVisible({ timeout: 15_000 });
	await card.click();
	await expect(page).toHaveURL(new RegExp(`/provider/${profileId}`));
	await expect(page.getByRole('heading', { level: 1, name: provider.displayName })).toBeVisible();

	const draft = draftBody();
	await page
		.getByRole('group', { name: 'Contact actions' })
		.getByRole('link', { name: /^Message / })
		.click();
	await expect(page).toHaveURL(new RegExp(`/messages/compose/${profileId}|/messages/[0-9a-f-]{36}`), {
		timeout: 15_000
	});

	if (page.url().includes('/compose/')) {
		await page.getByLabel('Your message').fill(draft);
		await page.getByRole('button', { name: 'Send message' }).click();
	} else {
		const threadIdFromUrl = new URL(page.url()).pathname.split('/messages/')[1]!;
		const composer = page.getByLabel('Write a message');
		await composer.click();
		await composer.pressSequentially(draft);
		const [sendResponse] = await Promise.all([
			page.waitForResponse(
				(res) =>
					res.url().includes(`/api/messaging/threads/${threadIdFromUrl}/messages`) &&
					res.request().method() === 'POST'
			),
			page.getByRole('button', { name: 'Send' }).click()
		]);
		expect(sendResponse.ok(), await sendResponse.text()).toBeTruthy();
	}

	await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 15_000 });
	const threadId = new URL(page.url()).pathname.split('/messages/')[1]!;
	const persisted = await page.request.get(`/api/messaging/threads/${threadId}/messages`);
	expect(persisted.ok(), await persisted.text()).toBeTruthy();
	const persistedBody = (await persisted.json()) as {
		data: Array<{ body: string }> | { messages?: Array<{ body: string }> };
	};
	const messages = Array.isArray(persistedBody.data)
		? persistedBody.data
		: (persistedBody.data.messages ?? []);
	expect(messages.some((message) => message.body === draft)).toBeTruthy();
	await expect(page.getByTestId('message-bubble-outbound').filter({ hasText: draft }).first()).toBeVisible({
		timeout: 15_000
	});
});
