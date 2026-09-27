import { expect, test } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import { assertPrimaryListingLive } from './live-backend-assert';

const REASONS = [
	'safety_concern',
	'fake_profile_photos',
	'harassment',
	'spam_scam',
	'other'
] as const;

async function registerAndVerifySeeker(
	page: import('@playwright/test').Page,
	email: string
): Promise<void> {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill('Burst Report Seeker');
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

test.describe('LLD §2.7 rapid reports do not auto-hide', () => {
	test('a burst of profile reports leaves the listing live until admin act', async ({ page }) => {
		test.setTimeout(90_000);
		const email = `burst-report-${Date.now()}@example.com`;
		await registerAndVerifySeeker(page, email);

		const before = await page.request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(before.ok()).toBeTruthy();
		const beforeBody = (await before.json()) as {
			data: { displayName: string; badges: { identityVerified: boolean } };
		};

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}/report`);
		await expect(page.getByTestId('report-reason-form')).toBeVisible();

		for (const reason of REASONS) {
			const filed = await page.request.post('/api/trust/reports', {
				data: {
					targetType: 'profile',
					targetId: SEED_CORE_PRIMARY_PROFILE_ID,
					reason,
					freeText: reason === 'other' ? 'Burst coverage gap' : undefined
				}
			});
			expect(filed.status(), await filed.text()).toBe(201);
		}

		const after = await page.request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(after.ok()).toBeTruthy();
		const afterBody = (await after.json()) as {
			data: { displayName: string; badges: { identityVerified: boolean } };
		};
		expect(afterBody.data.displayName).toBe(beforeBody.data.displayName);
		expect(afterBody.data.badges.identityVerified).toBe(beforeBody.data.badges.identityVerified);
		await assertPrimaryListingLive(page.request);
	});
});
