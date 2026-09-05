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
	expect(attachRes.ok()).toBeTruthy();

	await page.goto('/provider/onboarding?step=photos');
	await expect(page.getByTestId('gallery-thumb')).toHaveCount(1, { timeout: 20_000 });
	await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible({ timeout: 10_000 });
}

async function registerAndPublishProvider(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
) {
	const stamp = Date.now();
	const email = `e2e-preview-${stamp}@example.com`;
	const password = 'password123';
	const phone = `082${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Preview E2E');
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
	const intro = 'Preview as seeker E2E therapist profile.';
	await page.locator('#introField').fill(intro);
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
	const meBody = (await meRes.json()) as {
		data: { profileId: string; phoneVisible: boolean };
	};
	return { profileId: meBody.data.profileId };
}

test.describe('US-PONB-08 preview as seeker', () => {
	test('TC-PONB-08a: preview page shows both audiences with correct phone visibility', async ({
		page,
		request
	}) => {
		await registerAndPublishProvider(page, request);

		const anonApi = await page.request.get('/api/provider/me/profile/preview?as=anonymous');
		expect(anonApi.ok()).toBeTruthy();
		const anonBody = (await anonApi.json()) as { data: Record<string, unknown> };
		expect(anonBody.data.phone).toBeUndefined();

		const seekerApi = await page.request.get('/api/provider/me/profile/preview?as=seeker');
		expect(seekerApi.ok()).toBeTruthy();
		const seekerBody = (await seekerApi.json()) as { data: { phone?: string } };
		expect(seekerBody.data.phone).toMatch(/^\+27/);

		await page.goto('/provider/profile/preview');
		await expect(page.getByRole('heading', { name: 'Preview as seeker', level: 1 })).toBeVisible();

		const anonymousPanel = page.locator('section').filter({
			has: page.getByText('Visitors without an account', { exact: true })
		});
		const seekerPanel = page.locator('section').filter({
			has: page.getByText('Signed-in seekers', { exact: true })
		});

		await expect(anonymousPanel.getByText('Visitors without an account')).toBeVisible();
		await expect(seekerPanel.getByText('Signed-in seekers')).toBeVisible();

		await expect(anonymousPanel.getByText('Contact')).toHaveCount(0);
		await expect(anonymousPanel.getByRole('link', { name: 'Call' })).toHaveCount(0);

		await expect(seekerPanel.getByText('Contact')).toBeVisible();
		await expect(seekerPanel.getByRole('link', { name: 'Call' })).toBeVisible();
	});

	test('preview page has no critical or serious axe violations', async ({ page, request }) => {
		await registerAndPublishProvider(page, request);
		await page.goto('/provider/profile/preview');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
