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
	const email = `e2e-phone-vis-${stamp}@example.com`;
	const password = 'password123';
	const phone = `082${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Phone Vis E2E');
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
	const intro = 'Phone visibility E2E therapist profile.';
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

async function registerSeeker(
	page: import('@playwright/test').Page,
	email: string,
	password: string
) {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill('Phone Vis Seeker');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/profile/);
}

test.describe('US-PONB-07 control phone number exposure', () => {
	test('TC-PONB-07a/b/c: default OFF, toggle ON, signed-in always sees phone', async ({
		page,
		request,
		browser
	}) => {
		const { profileId } = await registerAndPublishProvider(page, request);

		const meRes = await page.request.get('/api/provider/me/profile');
		const meBody = (await meRes.json()) as { data: { phoneVisible: boolean } };
		expect(meBody.data.phoneVisible).toBe(false);

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		const apiOff = await anonPage.request.get(`/api/provider/profile/${profileId}`);
		expect(apiOff.ok()).toBeTruthy();
		const apiOffBody = (await apiOff.json()) as { data: Record<string, unknown> };
		expect(apiOffBody.data.phone).toBeUndefined();
		expect('phone' in apiOffBody.data).toBe(false);

		const htmlOff = await anonPage.goto(`/provider/${profileId}`);
		expect(htmlOff?.ok()).toBeTruthy();
		expect(await htmlOff!.text()).not.toMatch(/tel:\+27/);
		await expect(anonPage.getByRole('link', { name: 'Call' })).toHaveCount(0);

		await page.goto('/provider/profile/edit');
		await expect(
			page.getByText('Show my phone number to visitors without an account')
		).toBeVisible();
		const toggle = page.getByRole('switch', {
			name: 'Show my phone number to visitors without an account'
		});
		await expect(toggle).toHaveAttribute('aria-checked', 'false');

		const putOn = await page.request.put('/api/provider/profile/phone-visibility', {
			data: { visible: true }
		});
		expect(putOn.ok()).toBeTruthy();

		const apiOn = await anonPage.request.get(`/api/provider/profile/${profileId}`);
		const apiOnBody = (await apiOn.json()) as { data: { phone?: string } };
		expect(apiOnBody.data.phone).toMatch(/^\+27/);

		await anonPage.goto(`/provider/${profileId}`);
		await expect(anonPage.getByRole('link', { name: 'Call' })).toBeVisible();
		await expect(anonPage.locator('a[href^="tel:+27"]')).toHaveCount(2);

		const putOff = await page.request.put('/api/provider/profile/phone-visibility', {
			data: { visible: false }
		});
		expect(putOff.ok()).toBeTruthy();

		const apiOffAgain = await anonPage.request.get(`/api/provider/profile/${profileId}`);
		const apiOffAgainBody = (await apiOffAgain.json()) as { data: Record<string, unknown> };
		expect(apiOffAgainBody.data.phone).toBeUndefined();

		await page.reload();
		await expect(toggle).toHaveAttribute('aria-checked', 'false');

		const putOnAgain = await page.request.put('/api/provider/profile/phone-visibility', {
			data: { visible: true }
		});
		expect(putOnAgain.ok()).toBeTruthy();
		await page.reload();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		const seekerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const seekerEmail = `seeker-phone-vis-${Date.now()}@example.com`;
		await registerSeeker(seekerPage, seekerEmail, 'password123');

		const signedInApi = await seekerPage.request.get(`/api/provider/profile/${profileId}`);
		const signedInBody = (await signedInApi.json()) as { data: { phone?: string } };
		expect(signedInBody.data.phone).toMatch(/^\+27/);

		await seekerPage.goto(`/provider/${profileId}`);
		await expect(seekerPage.getByRole('link', { name: 'Call' })).toBeVisible();
		await expect(seekerPage.locator('a[href^="tel:+27"]')).toHaveCount(2);

		await anonContext.close();
		await seekerContext.close();
	});

	test('phone visibility setting has no critical or serious axe violations', async ({
		page,
		request
	}) => {
		await registerAndPublishProvider(page, request);
		await page.goto('/provider/profile/edit');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});

	test('intro save does not show phone visibility saved message', async ({ page, request }) => {
		await registerAndPublishProvider(page, request);
		await page.goto('/provider/profile/edit');

		const introField = page.locator('#introField');
		await introField.fill('Updated intro for phone visibility isolation check.');
		await page.getByRole('button', { name: 'Save introduction' }).click();

		await expect(page.getByText('Saved — your profile is live now.')).toBeVisible();
		await expect(
			page.getByText('Saved — your number is hidden from visitors without an account')
		).toHaveCount(0);
		await expect(
			page.getByText('Saved — visitors without an account can now call you from your profile')
		).toHaveCount(0);
	});
});
