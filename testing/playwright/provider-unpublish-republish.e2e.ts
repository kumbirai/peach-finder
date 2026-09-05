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
	const email = `e2e-unpublish-${stamp}@example.com`;
	const password = 'password123';
	const phone = `082${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Unpublish E2E');
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
	const intro = 'Wellness therapist taking a short break test profile.';
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
		data: { profileId: string; intro: string; publishState: string };
	};
	return { email, password, profileId: meBody.data.profileId, intro };
}

test.describe('US-PONB-06 unpublish and come back freely', () => {
	test('TC-PONB-06a: unpublish/republish round-trip is lossless', async ({
		page,
		request,
		browser
	}) => {
		const { profileId, intro } = await registerAndPublishProvider(page, request);

		const anonContext = await browser.newContext();
		const anonBefore = await anonContext.newPage();
		const publicBefore = await anonBefore.request.get(`/provider/${profileId}`);
		expect(publicBefore.ok()).toBeTruthy();

		await page.goto('/provider/dashboard');
		await page.getByRole('link', { name: 'Hide profile' }).click();
		await expect(
			page.getByText('Hiding your profile removes it from search immediately')
		).toBeVisible();
		await page.getByRole('button', { name: 'Yes, hide my profile' }).click();
		await expect(page.getByRole('heading', { name: 'Your profile is hidden' })).toBeVisible({
			timeout: 10_000
		});
		await expect(page.getByText(/pending review|approval queue|under review/i)).toHaveCount(0);

		const hiddenRes = await page.request.get('/api/provider/me/profile');
		const hiddenBody = (await hiddenRes.json()) as {
			data: { publishState: string; intro: string; photos: unknown[]; services: unknown[] };
		};
		expect(hiddenBody.data.publishState).toBe('unpublished');
		expect(hiddenBody.data.intro).toBe(intro);
		expect(hiddenBody.data.photos.length).toBeGreaterThan(0);
		expect(hiddenBody.data.services.length).toBeGreaterThan(0);

		const publicWhileHidden = await anonBefore.request.get(`/provider/${profileId}`);
		expect(publicWhileHidden.status()).toBe(404);

		let found = false;
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			const searchRes = await page.request.get(
				`/api/discovery/search?q=${encodeURIComponent('wellness therapist')}`
			);
			if (searchRes.ok()) {
				const searchBody = (await searchRes.json()) as {
					data: Array<{ providerProfileId: string }>;
				};
				if (!searchBody.data.some((card) => card.providerProfileId === profileId)) {
					found = true;
					break;
				}
			}
			await page.waitForTimeout(250);
		}
		expect(found).toBe(true);

		await page.getByRole('button', { name: 'Republish profile' }).click();
		await expect(page.getByRole('heading', { name: 'Your live profile' })).toBeVisible({
			timeout: 10_000
		});
		await expect(page.getByText(/pending review|approval queue|under review/i)).toHaveCount(0);

		const liveRes = await page.request.get('/api/provider/me/profile');
		const liveBody = (await liveRes.json()) as { data: { publishState: string; intro: string } };
		expect(liveBody.data.publishState).toBe('published');
		expect(liveBody.data.intro).toBe(intro);

		const publicAfter = await anonBefore.request.get(`/provider/${profileId}`);
		expect(publicAfter.ok()).toBeTruthy();
		const publicHtml = await publicAfter.text();
		expect(publicHtml).toContain(intro.slice(0, 30));

		const searchDeadline = Date.now() + 30_000;
		let rediscovered = false;
		while (Date.now() < searchDeadline) {
			const searchRes = await page.request.get(
				`/api/discovery/search?q=${encodeURIComponent('wellness therapist')}`
			);
			if (searchRes.ok()) {
				const searchBody = (await searchRes.json()) as {
					data: Array<{ providerProfileId: string }>;
				};
				if (searchBody.data.some((card) => card.providerProfileId === profileId)) {
					rediscovered = true;
					break;
				}
			}
			await page.waitForTimeout(1_000);
		}
		expect(rediscovered).toBe(true);
		await anonContext.close();
	});

	test('dashboard unpublish confirm has no critical or serious axe violations', async ({
		page,
		request
	}) => {
		await registerAndPublishProvider(page, request);
		await page.goto('/provider/dashboard?unpublishConfirm=1');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
