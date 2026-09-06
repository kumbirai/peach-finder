import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';
import {
	SEED_VERIF_PENDING_NEW_CASE_ID,
	SEED_VERIF_PENDING_OLD_CASE_ID,
	SEED_VERIF_PENDING_OLD_PROFILE_ID
} from '../../scripts/seed-verification-constants';

async function tinyJpeg(label: string): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160">
		<rect width="100%" height="100%" fill="#f5f0eb"/>
		<text x="12" y="28" font-family="sans-serif" font-size="14">${label}</text>
	</svg>`;
	return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function signInProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('heading', { name: 'Your dashboard' })).toBeVisible({
		timeout: 15_000
	});
}

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

test.describe('US-VERIF-01 submit my identity claim', () => {
	test('TC-VERIF-01a: provider submits documents and sees pending on dashboard', async ({
		page
	}) => {
		const beforeProfile = await page.request.get(
			`/api/provider/profile/${SEED_DUAL_ROLE_PROFILE_ID}`
		);
		expect(beforeProfile.ok()).toBeTruthy();
		const beforeBody = (await beforeProfile.json()) as { data: Record<string, unknown> };

		await signInProvider(page);

		const existingStatus = await page.request.get('/api/trust/verification/me');
		expect(existingStatus.ok()).toBeTruthy();
		const existingBody = (await existingStatus.json()) as { data: { status: string } };

		if (existingBody.data.status !== 'pending') {
			const idBytes = await tinyJpeg('e2e-id');
			const selfieBytes = await tinyJpeg('e2e-selfie');

			const idUpload = await page.request.post('/api/media/identity-docs', {
				multipart: {
					file: {
						name: 'id.jpg',
						mimeType: 'image/jpeg',
						buffer: idBytes
					},
					docKind: 'id'
				}
			});
			expect(idUpload.ok(), await idUpload.text()).toBeTruthy();
			const idBody = (await idUpload.json()) as { data: { photoId: string } };

			const selfieUpload = await page.request.post('/api/media/identity-docs', {
				multipart: {
					file: {
						name: 'selfie.jpg',
						mimeType: 'image/jpeg',
						buffer: selfieBytes
					},
					docKind: 'selfie'
				}
			});
			expect(selfieUpload.ok(), await selfieUpload.text()).toBeTruthy();
			const selfieBody = (await selfieUpload.json()) as { data: { photoId: string } };

			const submit = await page.request.post('/api/trust/verification', {
				data: { docPhotoIds: [idBody.data.photoId, selfieBody.data.photoId] }
			});
			expect(submit.status(), await submit.text()).toBe(201);
		}

		const status = await page.request.get('/api/trust/verification/me');
		expect(status.ok()).toBeTruthy();
		const statusBody = (await status.json()) as { data: { status: string } };
		expect(statusBody.data.status).toBe('pending');

		await page.goto('/provider/verify');
		await expect(page.getByTestId('verification-status-banner')).toHaveAttribute(
			'data-status',
			'pending'
		);

		await page.goto('/provider/dashboard');
		await expect(page.getByTestId('dashboard-verification')).toBeVisible();
		await expect(page.getByTestId('verification-status-banner')).toHaveAttribute(
			'data-status',
			'pending'
		);

		const afterProfile = await page.request.get(
			`/api/provider/profile/${SEED_DUAL_ROLE_PROFILE_ID}`
		);
		expect(afterProfile.ok()).toBeTruthy();
		const afterBody = (await afterProfile.json()) as { data: Record<string, unknown> };
		expect(afterBody.data.displayName).toBe(beforeBody.data.displayName);
		expect(afterBody.data.intro).toBe(beforeBody.data.intro);
	});

	test('TC-VERIF-01b: submitted documents are absent from public profile payload', async ({
		request
	}) => {
		const profile = await request.get(`/api/provider/profile/${SEED_DUAL_ROLE_PROFILE_ID}`);
		expect(profile.ok()).toBeTruthy();
		const text = await profile.text();
		expect(text).not.toContain('identity-docs');
		expect(text).not.toMatch(/e2e-id|e2e-selfie/);
	});

	test('has no critical or serious axe violations on provider verification page', async ({
		page
	}) => {
		await signInProvider(page);
		await page.goto('/provider/verify');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
