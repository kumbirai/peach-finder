import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { assertPrimaryListingLive } from './live-backend-assert';
import { registerVerifiedProvider } from './provider-session';

async function uploadTestPhoto(page: import('@playwright/test').Page) {
	const stamp = Date.now();
	const buffer = await sharp({
		create: {
			width: 64 + (stamp % 20),
			height: 64 + (stamp % 17),
			channels: 3,
			background: { r: stamp % 200, g: (stamp >> 3) % 200, b: (stamp >> 5) % 200 }
		}
	})
		.jpeg()
		.toBuffer();

	const uploadRes = await page.request.post('/api/media/uploads', {
		multipart: {
			file: { name: 'profile.jpg', mimeType: 'image/jpeg', buffer },
			scope: 'profile_photo'
		}
	});
	expect(uploadRes.ok()).toBeTruthy();
	const uploadBody = (await uploadRes.json()) as { data: { photoId: string } };

	const attachRes = await page.request.post('/api/provider/profile/photos', {
		data: { photoId: uploadBody.data.photoId },
		headers: { 'Content-Type': 'application/json' }
	});
	expect(attachRes.ok()).toBeTruthy();

	await page.goto('/provider/onboarding?step=photos');
	await expect(page.getByTestId('gallery-thumb')).toHaveCount(1, { timeout: 20_000 });
	await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible({ timeout: 10_000 });
}

async function registerFreshProvider(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
): Promise<{ email: string; password: string }> {
	const stamp = Date.now();
	const email = `e2e-onboarding-${stamp}@example.com`;
	const password = 'password123';
	const phone = `084${String(stamp).slice(-7)}`;

	await registerVerifiedProvider(page, request, {
		name: 'Onboarding E2E',
		email,
		phone,
		password
	});

	return { email, password };
}

test.describe('US-PONB-02 guided onboarding', () => {
	test('TC-PONB-02a: checklist resumes at services after photos and intro', async ({
		page,
		request,
		browser
	}) => {
		const credentials = await registerFreshProvider(page, request);

		await expect(page.getByRole('heading', { name: 'Add your photos' })).toBeVisible();
		await uploadTestPhoto(page);
		await page.getByRole('link', { name: 'Continue' }).click();

		await expect(page.getByRole('heading', { name: 'Write your introduction' })).toBeVisible();
		await page
			.locator('#introField')
			.fill('Deep tissue specialist with a calm, focused approach to sports recovery.');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Add your services' })).toBeVisible({
			timeout: 15_000
		});

		await page.context().close();

		const freshContext = await browser.newContext();
		const freshPage = await freshContext.newPage();
		await freshPage.goto('/sign-in?flow=sign-in');
		await freshPage.getByLabel('Email').fill(credentials.email);
		await freshPage.getByLabel('Password').fill(credentials.password);
		await freshPage.getByRole('button', { name: 'Sign in' }).click();
		await freshPage.goto('/provider/onboarding');

		await expect(freshPage.getByRole('heading', { name: 'Add your services' })).toBeVisible({
			timeout: 20_000
		});
		await freshContext.close();
	});

	test('TC-PONB-02b: publish readiness names missing fields after partial completion', async ({
		page,
		request
	}) => {
		await registerFreshProvider(page, request);

		await uploadTestPhoto(page);
		await page.getByRole('link', { name: 'Continue' }).click();
		await page.locator('#introField').fill('Intro for readiness test.');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Add your services' })).toBeVisible();

		await page.goto('/provider/onboarding?step=publish');

		await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible();
		await expect(page.getByRole('status')).toContainText('at least one priced service');
		await expect(page.getByRole('status')).toContainText('at least one language');
	});

	test('onboarding wizard has no critical or serious axe violations', async ({ page, request }) => {
		await registerFreshProvider(page, request);
		await assertPrimaryListingLive(page.request);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
