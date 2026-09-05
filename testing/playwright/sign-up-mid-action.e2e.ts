import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

const DRAFT = 'Hi Amara, are you free tomorrow afternoon?';

test.describe('US-ACC-02 sign up mid-action', () => {
	test('TC-ACC-02a: message interruption returns to compose with draft intact', async ({
		page
	}) => {
		const email = `e2e-${Date.now()}@example.com`;
		const profileUrl = `/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`;

		await page.goto(profileUrl);
		await page.evaluate(
			({ id, draft }) => sessionStorage.setItem(`pf_message_draft_${id}`, draft),
			{ id: SEED_CORE_PRIMARY_PROFILE_ID, draft: DRAFT }
		);
		await page.reload();

		const message = page.getByRole('group', { name: 'Contact actions' }).getByRole('link', {
			name: /^Message /
		});
		await message.click();
		await expect(page).toHaveURL(/\/sign-in\?/);
		await expect(page).toHaveURL(/draft=/);

		await page.getByLabel('Your name').fill('E2E Seeker');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Create account' }).click();

		await expect(page).toHaveURL(
			new RegExp(`/messages/compose/${SEED_CORE_PRIMARY_PROFILE_ID}\\?draft=`)
		);
		await expect(page.getByLabel('Your message')).toHaveValue(DRAFT, { timeout: 10_000 });
	});

	test('TC-ACC-02c: email verification gates first send then delivers held message', async ({
		page,
		request
	}) => {
		const email = `e2e-held-${Date.now()}@example.com`;
		const composeUrl = `/messages/compose/${SEED_CORE_PRIMARY_PROFILE_ID}`;

		await page.goto(
			`/sign-in?returnTo=${encodeURIComponent(composeUrl)}&action=message&providerProfileId=${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		await page.getByLabel('Your name').fill('Held Seeker');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(new RegExp(`/messages/compose/`));

		await page.getByLabel('Your message').fill(DRAFT);
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.getByText(/deliver this message/i)).toBeVisible({ timeout: 10_000 });

		const tokenRes = await request.post('/api/dev/verification-token', {
			data: { email }
		});
		expect(tokenRes.ok()).toBe(true);
		const { data } = (await tokenRes.json()) as { data: { token: string } };

		await page.goto(`/verify-email?token=${data.token}&returnTo=${encodeURIComponent(composeUrl)}`);
		await page.getByRole('button', { name: 'Verify email' }).click();

		await expect(page).toHaveURL(new RegExp(`/messages/compose/`));

		await expect
			.poll(async () => {
				const res = await request.get(
					`/api/dev/message-state?email=${encodeURIComponent(email)}&providerProfileId=${SEED_CORE_PRIMARY_PROFILE_ID}`
				);
				const json = (await res.json()) as { data: { messageCount: number } };
				return json.data.messageCount;
			})
			.toBe(1);

		await page.reload();
		await expect(page.getByText(DRAFT)).toBeVisible({ timeout: 10_000 });
	});

	test('TC-ACC-02d: interruption is exactly one screen', async ({ page }) => {
		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await page
			.getByRole('group', { name: 'Contact actions' })
			.getByRole('link', { name: /^Message / })
			.click();
		await expect(page).toHaveURL(/\/sign-in/);
		await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
		// No wizard step indicators / next buttons beyond sign-in|sign-up toggle
		await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
	});

	test('sign-in screen has no critical or serious axe violations', async ({ page }) => {
		await page.goto(
			`/sign-in?returnTo=/provider/${SEED_CORE_PRIMARY_PROFILE_ID}&action=message&providerProfileId=${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
