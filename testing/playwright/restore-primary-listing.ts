import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import {
	SEED_SAFE02_AMARA_EMAIL,
	SEED_SAFE02_AMARA_PASSWORD
} from '../../scripts/seed-blocking-constants';

export async function restorePrimaryListingViaApi(request: APIRequestContext): Promise<void> {
	const restore = await request.post('/api/dev/restore-seed-core-primary');
	expect(restore.ok(), await restore.text()).toBeTruthy();
	const profile = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
	expect(profile.ok()).toBeTruthy();
}

export async function signInPrimaryProvider(page: Page): Promise<void> {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_SAFE02_AMARA_EMAIL);
	await page.getByLabel('Password').fill(SEED_SAFE02_AMARA_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 30_000 });
}

export async function restorePrimaryListing(browser: Browser): Promise<void> {
	const restoreContext = await browser.newContext();
	try {
		await restorePrimaryListingViaApi(restoreContext.request);
		await expect
			.poll(async () => {
				const probe = await browser.newContext();
				const status = (
					await probe.request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`)
				).status();
				await probe.close();
				return status;
			})
			.toBe(200);
	} finally {
		await restoreContext.close();
	}
}
