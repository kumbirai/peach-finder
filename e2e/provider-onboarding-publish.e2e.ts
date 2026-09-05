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

async function registerFreshProvider(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext
): Promise<{ email: string; password: string; registeredAt: number }> {
	const registeredAt = Date.now();
	const stamp = registeredAt;
	const email = `e2e-publish-${stamp}@example.com`;
	const password = 'password123';
	const phone = `082${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Publish E2E');
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

	return { email, password, registeredAt };
}

async function completeOnboardingEssentials(page: import('@playwright/test').Page) {
	await uploadTestPhoto(page);
	await page.getByRole('link', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Write your introduction' })).toBeVisible({
		timeout: 15_000
	});
	const intro = 'Sports recovery specialist with a calm, focused approach.';
	await page.locator('#introField').fill(intro);
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Add your services' })).toBeVisible({
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
	await page.locator('#areaField').selectOption({ index: 1 });
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible({
		timeout: 15_000
	});
	return intro;
}

test.describe('US-PONB-04 provider onboarding publish', () => {
	test('TC-PONB-04a/b/c: publish is instant, trial starts at publish, search within 30s', async ({
		page,
		request,
		browser
	}) => {
		const { email, password, registeredAt } = await registerFreshProvider(page, request);
		const intro = await completeOnboardingEssentials(page);

		await expect(page.getByText(/pending review|approval queue|under review/i)).toHaveCount(0);

		const publishStarted = Date.now();
		await page.locator('form.publish-form button[type="submit"]').click();
		await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
		await expect(page.getByText(/pending review|approval queue|under review/i)).toHaveCount(0);

		const meRes = await page.request.get('/api/provider/me/profile');
		expect(meRes.ok()).toBeTruthy();
		const meBody = (await meRes.json()) as {
			data: {
				profileId: string;
				publishState: string;
				listing: { trialStartedAt: string | null; trialEndsAt: string | null };
			};
		};
		expect(meBody.data.publishState).toBe('published');
		expect(meBody.data.listing?.trialStartedAt).toBeTruthy();
		const trialStarted = Date.parse(meBody.data.listing!.trialStartedAt!);
		expect(trialStarted).toBeGreaterThanOrEqual(publishStarted - 5_000);
		expect(trialStarted).toBeGreaterThan(registeredAt + 1_000);

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		const publicRes = await anonPage.request.get(`/provider/${meBody.data.profileId}`);
		expect(publicRes.ok()).toBeTruthy();
		const publicHtml = await publicRes.text();
		expect(publicHtml).toContain(intro.slice(0, 40));
		await anonContext.close();

		const deadline = Date.now() + 30_000;
		let found = false;
		while (Date.now() < deadline) {
			const searchRes = await page.request.get(
				`/api/discovery/search?q=${encodeURIComponent('sports recovery')}`
			);
			if (searchRes.ok()) {
				const searchBody = (await searchRes.json()) as {
					data: Array<{ providerProfileId: string }>;
				};
				if (searchBody.data.some((card) => card.providerProfileId === meBody.data.profileId)) {
					found = true;
					break;
				}
			}
			await page.waitForTimeout(1_000);
		}
		expect(found).toBe(true);

		await page.goto('/sign-in?flow=sign-in');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill(password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.goto('/provider/onboarding');
		await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible({
			timeout: 20_000
		});
		await expect(page.locator('form.publish-form button[type="submit"]')).toBeVisible();
	});

	test('publish step has no critical or serious axe violations', async ({ page, request }) => {
		await registerFreshProvider(page, request);
		await completeOnboardingEssentials(page);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
