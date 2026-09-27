import { expect, test } from '@playwright/test';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../scripts/seed-core';
import {
	SEED_SAFE02_AMARA_EMAIL,
	SEED_SAFE02_AMARA_PASSWORD
} from '../../scripts/seed-blocking-constants';
import { assertPrimaryListingLive } from './live-backend-assert';

async function signInAdmin(request: import('@playwright/test').APIRequestContext) {
	const login = await request.post('/admin/api/identity/login', {
		data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }
	});
	expect(login.ok()).toBeTruthy();
	const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
	const totp = await request.post('/admin/api/identity/login/totp', {
		data: { totpCode: loginBody.data.devTotpCode }
	});
	expect(totp.ok(), await totp.text()).toBeTruthy();
}

async function restorePrimaryListing(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_SAFE02_AMARA_EMAIL);
	await page.getByLabel('Password').fill(SEED_SAFE02_AMARA_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
	const live = await page.request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
	if (!live.ok()) {
		const publish = await page.request.post('/api/provider/profile/publish');
		expect(publish.ok(), await publish.text()).toBeTruthy();
	}
}

test.describe('LLD §2.7 moderation idempotency', () => {
	test('the same Idempotency-Key does not take the listing down twice', async ({
		page,
		request,
		browser
	}) => {
		test.setTimeout(90_000);
		await restorePrimaryListing(page);
		await assertPrimaryListingLive(request);
		await signInAdmin(request);

		const key = `e2e-unpublish-${Date.now()}`;
		const payload = {
			providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
			reason: 'Idempotent unpublish from coverage-gap spec.'
		};
		const first = await request.post('/admin/api/trust/moderation/unpublish', {
			headers: { 'Idempotency-Key': key },
			data: payload
		});
		expect(first.ok(), await first.text()).toBeTruthy();
		const firstBody = (await first.json()) as { data: { moderationActionId: string } };

		const second = await request.post('/admin/api/trust/moderation/unpublish', {
			headers: { 'Idempotency-Key': key },
			data: payload
		});
		expect(second.ok(), await second.text()).toBeTruthy();
		const secondBody = (await second.json()) as { data: { moderationActionId: string } };
		expect(secondBody.data.moderationActionId).toBe(firstBody.data.moderationActionId);

		const effect = await request.post('/api/dev/moderation-effect-dispatch');
		expect(effect.ok(), await effect.text()).toBeTruthy();

		const publicContext = await browser.newContext();
		const publicPage = await publicContext.newPage();
		const hidden = await publicPage.request.get(
			`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(hidden.status()).toBeGreaterThanOrEqual(400);
		await publicContext.close();

		const republish = await page.request.post('/api/provider/profile/publish');
		expect(republish.ok(), await republish.text()).toBeTruthy();
		await expect
			.poll(async () => {
				const probe = await browser.newContext();
				const probePage = await probe.newPage();
				const restored = await probePage.request.get(
					`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
				);
				const status = restored.status();
				await probe.close();
				return status;
			})
			.toBe(200);
	});
});
