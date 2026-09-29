import { expect, test } from '@playwright/test';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import { assertPrimaryListingLive } from './live-backend-assert';
import { restorePrimaryListing } from './restore-primary-listing';

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

test.describe('LLD §2.7 moderation idempotency', () => {
	test('the same Idempotency-Key does not take the listing down twice', async ({
		request,
		browser
	}) => {
		test.setTimeout(90_000);
		await restorePrimaryListing(browser);
		await assertPrimaryListingLive(request);
		try {
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
		} finally {
			await restorePrimaryListing(browser);
			await assertPrimaryListingLive(request);
		}
	});
});
