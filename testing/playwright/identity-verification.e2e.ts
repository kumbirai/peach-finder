import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } from '../../scripts/seed-core';
import {
	SEED_VERIF_PENDING_NEW_CASE_ID,
	SEED_VERIF_PENDING_OLD_CASE_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID
} from '../../scripts/seed-verification-constants';

async function signInAdmin(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
) {
	const login = await request.post('/admin/api/identity/login', {
		data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }
	});
	expect(login.ok()).toBeTruthy();
	const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
	expect(loginBody.data.devTotpCode).toBeTruthy();

	const totp = await request.post('/admin/api/identity/login/totp', {
		data: { totpCode: loginBody.data.devTotpCode }
	});
	expect(totp.ok(), await totp.text()).toBeTruthy();

	const storage = await request.storageState();
	await page.context().addCookies(storage.cookies);
}

test.describe.configure({ mode: 'serial' });

test.describe('US-ADMIN-02 work the identity queue', () => {
	test('TC-ADMIN-02a: oldest pending case first with profile and documents', async ({
		page,
		request
	}) => {
		await signInAdmin(page, request);
		await page.goto('/admin/identity');
		await expect(page.getByTestId('admin-identity-queue')).toBeVisible();

		const cases = page.getByTestId('identity-queue-case');
		await expect(cases).toHaveCount(2);
		await expect(cases.first()).toHaveAttribute('data-case-id', SEED_VERIF_PENDING_OLD_CASE_ID);
		await expect(cases.nth(1)).toHaveAttribute('data-case-id', SEED_VERIF_PENDING_NEW_CASE_ID);
		await expect(page.getByTestId('queue-age').first()).toContainText('day');

		await expect(page.getByText('ID photo + selfie submitted').first()).toBeVisible();
		await expect(page.getByTestId('identity-queue-profile').first()).toBeVisible();
	});

	test('TC-ADMIN-02b: document presign URL is issued to authenticated admin', async ({
		request
	}) => {
		const login = await request.post('/admin/api/identity/login', {
			data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }
		});
		expect(login.ok()).toBeTruthy();
		const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
		const totp = await request.post('/admin/api/identity/login/totp', {
			data: { totpCode: loginBody.data.devTotpCode }
		});
		expect(totp.ok()).toBeTruthy();

		const queue = await request.get('/admin/api/trust/verification/queue');
		expect(queue.ok()).toBeTruthy();
		const body = (await queue.json()) as {
			data: { queue: Array<{ docPhotoIds: string[] }> };
		};
		const photoId = body.data.queue[0]?.docPhotoIds[0];
		expect(photoId).toBeTruthy();

		const presign = await request.get(`/admin/api/media/identity-doc-url/${photoId}`);
		expect(presign.ok(), await presign.text()).toBeTruthy();
		const presignBody = (await presign.json()) as { data: { url: string; expiresAt: string } };
		expect(presignBody.data.url).toContain('/admin/api/media/identity-doc/');
		const doc = await request.get(presignBody.data.url);
		expect(doc.ok()).toBeTruthy();
		expect(doc.headers()['content-type']).toContain('image/jpeg');
	});

	test('TC-ADMIN-02c: approving grants badge without changing public profile visibility', async ({
		page,
		request
	}) => {
		const before = await request.get(`/api/provider/profile/${SEED_VERIF_PENDING_OLD_PROFILE_ID}`);
		expect(before.ok()).toBeTruthy();
		const beforeBody = (await before.json()) as { data: Record<string, unknown> };

		await signInAdmin(page, request);
		const approve = await request.post(
			`/admin/api/trust/verification/${SEED_VERIF_PENDING_OLD_CASE_ID}/approve`,
			{ data: {} }
		);
		expect(approve.ok(), await approve.text()).toBeTruthy();

		const after = await request.get(`/api/provider/profile/${SEED_VERIF_PENDING_OLD_PROFILE_ID}`);
		expect(after.ok()).toBeTruthy();
		const afterBody = (await after.json()) as {
			data: { badges: { identityVerified: boolean }; displayName: string };
		};
		expect(afterBody.data.badges.identityVerified).toBe(true);
		expect(afterBody.data.displayName).toBe(beforeBody.data.displayName);
	});

	test('TC-ADMIN-02c: rejecting the remaining case requires a reason', async ({
		page,
		request
	}) => {
		await signInAdmin(page, request);
		const blocked = await request.post(
			`/admin/api/trust/verification/${SEED_VERIF_PENDING_NEW_CASE_ID}/reject`,
			{ data: { reason: '' } }
		);
		expect(blocked.status()).toBe(422);

		const rejected = await request.post(
			`/admin/api/trust/verification/${SEED_VERIF_PENDING_NEW_CASE_ID}/reject`,
			{ data: { reason: 'Selfie did not match the ID photo.' } }
		);
		expect(rejected.ok(), await rejected.text()).toBeTruthy();

		const queue = await request.get('/admin/api/trust/verification/queue');
		expect(queue.ok()).toBeTruthy();
		const body = (await queue.json()) as { data: { queue: Array<{ caseId: string }> } };
		expect(body.data.queue.some((item) => item.caseId === SEED_VERIF_PENDING_NEW_CASE_ID)).toBe(
			false
		);
	});

	test('has no critical or serious axe violations on identity queue', async ({ page, request }) => {
		await signInAdmin(page, request);
		await page.goto('/admin/identity');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
