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
	if (!uploadRes.ok()) {
		throw new Error(`upload failed: ${uploadRes.status()} ${await uploadRes.text()}`);
	}
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
	const email = `e2e-profile-build-${stamp}@example.com`;
	const password = 'password123';
	const phone = `083${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Profile Build E2E');
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

	return { email, password };
}

test.describe('US-PONB-03 build the profile itself', () => {
	test('TC-PONB-03a/b: uploads a real photo and rejects oversize file', async ({
		page,
		request
	}) => {
		await registerFreshProvider(page, request);
		await uploadTestPhoto(page);

		const oversize = Buffer.alloc(11 * 1024 * 1024, 1);
		const uploadRes = await request.post('/api/media/uploads', {
			multipart: {
				file: {
					name: 'big.jpg',
					mimeType: 'image/jpeg',
					buffer: oversize
				},
				scope: 'profile_photo'
			}
		});
		expect(uploadRes.status()).toBeGreaterThanOrEqual(400);
	});

	test('TC-PONB-03d: intro live counter respects 600 char cap', async ({ page, request }) => {
		await registerFreshProvider(page, request);
		await uploadTestPhoto(page);
		await page.getByRole('link', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Write your introduction' })).toBeVisible({
			timeout: 15_000
		});

		const intro = 'x'.repeat(650);
		await page.locator('#introField').fill(intro);
		const value = await page.locator('#introField').inputValue();
		expect(value.length).toBeLessThanOrEqual(600);
		await expect(page.getByText(/\/ 600/)).toBeVisible();
	});

	test('TC-PONB-03e/f: tag proposal and area-only location', async ({ page, request }) => {
		await registerFreshProvider(page, request);

		await uploadTestPhoto(page);
		await page.getByRole('link', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Write your introduction' })).toBeVisible({
			timeout: 15_000
		});
		const introText = 'Warm, focused deep tissue sessions.';
		await page.locator('#introField').fill(introText);
		await page.getByRole('button', { name: 'Continue' }).click();

		await page.locator('#serviceName').fill('Deep tissue');
		await page.locator('#durationMinutes').fill('60');
		await page.locator('#priceRands').fill('450');
		await page.getByPlaceholder('Propose a new tag').fill('Hot stone');
		await page.getByRole('button', { name: 'Propose' }).click();
		await expect(page.getByRole('status')).toContainText('submitted for review', {
			timeout: 15_000
		});

		await page.locator('#serviceName').fill('Deep tissue');
		await page.locator('#durationMinutes').fill('60');
		await page.locator('#priceRands').fill('450');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Languages you speak' })).toBeVisible({
			timeout: 15_000
		});
		await page.locator('label.chip-selectable', { hasText: 'English' }).click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Confirm your general area' })).toBeVisible({
			timeout: 15_000
		});

		await expect(page.locator('#areaField')).toBeVisible();
		await expect(page.getByLabel('Street address')).toHaveCount(0);

		await page.locator('#areaField').selectOption({ index: 1 });
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByText(`${introText.length} / 600 characters`)).toBeVisible();
	});

	test('photos step has no critical or serious axe violations', async ({ page, request }) => {
		await registerFreshProvider(page, request);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
