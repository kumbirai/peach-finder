import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

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
	if (!attachRes.ok()) {
		throw new Error(`attach failed: ${attachRes.status()} ${await attachRes.text()}`);
	}

	await page.goto('/provider/onboarding?step=photos');
	await expect(page.getByTestId('gallery-thumb')).toHaveCount(1, { timeout: 20_000 });
	await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible({ timeout: 10_000 });
}

async function registerAndPublishProvider(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
) {
	const stamp = Date.now();
	const email = `e2e-edit-live-${stamp}@example.com`;
	const password = 'password123';
	const phone = `082${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Edit Live E2E');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Mobile number').fill(phone);
	await page.locator('#areaId').selectOption({ index: 1 });
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByLabel('Verification code')).toBeVisible({ timeout: 10_000 });
	const otpId = await page.locator('input[name="otpId"]').inputValue();
	const otpRes = await request.post('/api/dev/otp-code', { data: { otpId } });
	const { data } = (await otpRes.json()) as { data: { code: string } };
	await page.getByLabel('Verification code').fill(data.code);
	await page.getByRole('button', { name: 'Verify and continue' }).click();
	await expect(page).toHaveURL(/\/provider\/onboarding/, { timeout: 15_000 });

	await uploadTestPhoto(page);
	await page.getByRole('link', { name: 'Continue' }).click();
	await page.locator('#introField').fill('Original intro for live edit test.');
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.locator('#serviceName').fill('Deep tissue');
	await page.locator('#durationMinutes').fill('60');
	await page.locator('#priceRands').fill('450');
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.locator('label.chip-selectable', { hasText: 'English' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.locator('#areaField').selectOption({ index: 1 });
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.locator('form.publish-form button[type="submit"]').click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });

	const meRes = await page.request.get('/api/provider/me/profile');
	const meBody = (await meRes.json()) as { data: { profileId: string } };
	return { email, password, profileId: meBody.data.profileId };
}

test.describe('US-PONB-05 edit live always', () => {
	test('TC-PONB-05a: intro edit is live on save with no review gate', async ({
		page,
		request,
		browser
	}) => {
		const { profileId } = await registerAndPublishProvider(page, request);

		await page.goto('/provider/profile/edit');
		const liveIntro = 'Live edited intro visible immediately to everyone.';
		await page.locator('#introField').fill(liveIntro);
		await page.getByRole('button', { name: 'Save introduction' }).click();
		await expect(page.getByText('Saved — your profile is live now.')).toBeVisible({
			timeout: 10_000
		});
		await expect(page.getByText(/pending review|approval queue|under review/i)).toHaveCount(0);

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		const publicRes = await anonPage.request.get(`/provider/${profileId}`);
		expect(publicRes.ok()).toBeTruthy();
		const publicHtml = await publicRes.text();
		expect(publicHtml).toContain(liveIntro.slice(0, 30));
		await anonContext.close();
	});

	test('TC-PONB-05b: verified provider name change suppresses badge only', async ({
		page,
		request,
		browser
	}) => {
		const { profileId } = await registerAndPublishProvider(page, request);

		const grantRes = await page.request.post('/api/dev/grant-identity-badge');
		expect(grantRes.ok()).toBeTruthy();

		const anonContext = await browser.newContext();
		const anonBefore = await anonContext.newPage();
		await anonBefore.goto(`/provider/${profileId}`);
		await expect(anonBefore.getByText('Identity verified')).toBeVisible({ timeout: 10_000 });

		await page.goto('/profile');
		await page.getByLabel('Display name').fill('Renamed Live E2E');
		await page.getByRole('button', { name: 'Save name' }).click();
		await expect(page.getByText('Display name updated.')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(/Identity verified badge is hidden/i)).toBeVisible();

		const anonAfter = await anonContext.newPage();
		await anonAfter.goto(`/provider/${profileId}`);
		await expect(
			anonAfter.getByRole('heading', { level: 1, name: 'Renamed Live E2E' })
		).toBeVisible();
		await expect(anonAfter.getByText('Identity verified')).toHaveCount(0);
		await expect(anonAfter.getByText(/unpublished|under review|pending approval/i)).toHaveCount(0);
		await anonContext.close();
	});

	test('edit profile page has no critical or serious axe violations', async ({ page, request }) => {
		await registerAndPublishProvider(page, request);
		await page.goto('/provider/profile/edit');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
