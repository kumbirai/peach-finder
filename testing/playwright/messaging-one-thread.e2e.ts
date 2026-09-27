import { expect, test } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

async function registerAndVerifySeeker(
	page: import('@playwright/test').Page,
	email: string
): Promise<void> {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill('One Thread Seeker');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('password123');
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });

	let tokenRes = await page.request.post('/api/dev/verification-token', { data: { email } });
	if (!tokenRes.ok()) {
		await page.waitForTimeout(500);
		tokenRes = await page.request.post('/api/dev/verification-token', { data: { email } });
	}
	expect(tokenRes.ok()).toBeTruthy();
	const { data } = (await tokenRes.json()) as { data: { token: string } };
	await page.goto(`/verify-email?token=${data.token}&returnTo=/profile`);
	await page.getByRole('button', { name: 'Verify email' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
}

test.describe('LLD §2.5 one thread per pair under concurrency', () => {
	test('parallel first sends reuse a single thread id', async ({ page }) => {
		test.setTimeout(90_000);
		const email = `one-thread-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, email);

		const [first, second] = await Promise.all([
			page.request.post('/api/messaging/threads', {
				data: {
					providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
					body: 'Concurrent first message A'
				}
			}),
			page.request.post('/api/messaging/threads', {
				data: {
					providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
					body: 'Concurrent first message B'
				}
			})
		]);
		expect(first.ok(), await first.text()).toBeTruthy();
		expect(second.ok(), await second.text()).toBeTruthy();
		const firstBody = (await first.json()) as { data: { threadId: string; status: string } };
		const secondBody = (await second.json()) as { data: { threadId: string; status: string } };
		expect(firstBody.data.status).toBe('sent');
		expect(secondBody.data.status).toBe('sent');
		expect(firstBody.data.threadId).toBe(secondBody.data.threadId);

		const listed = await page.request.get('/api/messaging/threads');
		expect(listed.ok()).toBeTruthy();
		const listedBody = (await listed.json()) as { data: { threads: Array<{ threadId: string }> } };
		expect(listedBody.data.threads.map((thread) => thread.threadId)).toEqual([
			firstBody.data.threadId
		]);
	});
});
