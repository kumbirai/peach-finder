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

async function registerAndPublishProvider(page: import('@playwright/test').Page) {
	const stamp = Date.now();
	const email = `e2e-avail-${stamp}@example.com`;
	const password = 'password123';
	const phone = `082${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Avail E2E');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Mobile number').fill(phone);
	await page.locator('#areaId').selectOption({ index: 1 });
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByLabel('Verification code')).toBeVisible({ timeout: 10_000 });
	const otpId = await page.locator('input[name="otpId"]').inputValue();
	const otpRes = await page.request.post('/api/dev/otp-code', { data: { otpId } });
	const { data } = (await otpRes.json()) as { data: { code: string } };
	await page.getByLabel('Verification code').fill(data.code);
	await page.getByRole('button', { name: 'Verify and continue' }).click();
	await expect(page).toHaveURL(/\/provider\/onboarding/, { timeout: 15_000 });

	await uploadTestPhoto(page);
	await page.getByRole('link', { name: 'Continue' }).click();
	await page.locator('#introField').fill('Availability one tap E2E therapist profile.');
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
	expect(meRes.ok()).toBeTruthy();
	const meBody = (await meRes.json()) as { data: { profileId: string } };
	return { profileId: meBody.data.profileId, displayName: 'Avail E2E' };
}

test.describe('US-AVAIL-01 one tap available', () => {
	test('TC-AVAIL-01a: single-tap set from dashboard and profile preview', async ({
		page,
		browser
	}) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const toggle = page.getByTestId('availability-toggle');
		await expect(toggle).toHaveAttribute('aria-checked', 'false');

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();
		await page.reload();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		const statusRes = await page.request.get('/api/availability/status/me');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: { availability: { state: string; setAt: string | null } };
		};
		expect(statusBody.data.availability.state).toBe('available');
		expect(statusBody.data.availability.setAt).toBeTruthy();

		await page.goto('/provider/profile/preview');
		const previewToggle = page.getByTestId('availability-toggle');
		await expect(previewToggle).toHaveAttribute('aria-checked', 'true');

		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await anonPage.goto('/');
		await expect(anonPage.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
		const card = anonPage.locator(`a[href="/provider/${profileId}"]`).first();
		await expect(card.getByText('Available now')).toBeVisible({ timeout: 15_000 });
		await anonContext.close();
	});

	test('TC-AVAIL-01c: re-tap refreshes availability ordering', async ({ page, browser }) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);
		const toggle = page.getByTestId('availability-toggle');

		const firstPost = await page.request.post('/api/availability/status');
		expect(firstPost.ok(), await firstPost.text()).toBeTruthy();

		const firstSet = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string } };
			}
		).data.availability.setAt;

		await page.waitForTimeout(1_100);

		const renewPost = await page.request.post('/api/availability/status');
		expect(renewPost.ok(), await renewPost.text()).toBeTruthy();
		const secondSet = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string } };
			}
		).data.availability.setAt;
		expect(new Date(secondSet).getTime()).toBeGreaterThan(new Date(firstSet).getTime());

		await page.reload();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await anonPage.goto('/');
		const firstCardLink = anonPage.locator('a[href^="/provider/"]').first();
		await expect(firstCardLink).toBeVisible({ timeout: 15_000 });
		await expect(firstCardLink).toHaveAttribute('href', `/provider/${profileId}`);
		await expect(anonPage.getByText(displayName).first()).toBeVisible();
		await anonContext.close();
	});
});
