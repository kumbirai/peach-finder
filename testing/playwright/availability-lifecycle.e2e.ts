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
}

async function registerAndPublishProvider(page: import('@playwright/test').Page) {
	const stamp = Date.now();
	const email = `e2e-lifecycle-${stamp}@example.com`;
	const password = 'password123';
	const phone = `083${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Lifecycle E2E');
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
	await page.locator('#introField').fill('Availability lifecycle E2E therapist profile.');
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
	return { profileId: meBody.data.profileId, displayName: 'Lifecycle E2E' };
}

test.describe('US-AVAIL-03 availability lifecycle', () => {
	test('TC-AVAIL-03b: warning notification and still-available renewal', async ({ page }) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const statusRes = await page.request.get('/api/availability/status/me');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: { availability: { expiresAt: string } };
		};
		const expiresAt = new Date(statusBody.data.availability.expiresAt);
		const warnAt = new Date(expiresAt.getTime() - 15 * 60_000);

		const warnTick = await page.request.post('/api/dev/availability-tick', {
			data: { now: warnAt.toISOString() }
		});
		expect(warnTick.ok(), await warnTick.text()).toBeTruthy();

		await page.goto('/provider/dashboard');
		await expect(page.getByTestId('availability-renewal-banner')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('still-available-button')).toBeVisible();

		const beforeRenew = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string } };
			}
		).data.availability.setAt;

		await page.getByTestId('still-available-button').click();
		await expect(page.getByTestId('availability-renewal-banner')).toHaveCount(0, {
			timeout: 15_000
		});

		const afterRenew = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string; state: string } };
			}
		).data.availability;
		expect(afterRenew.state).toBe('available');
		expect(new Date(afterRenew.setAt).getTime()).toBeGreaterThan(new Date(beforeRenew).getTime());

		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);

		void profileId;
		void displayName;
	});

	test('TC-AVAIL-03a/03c: auto-expire clears availability without negative marker', async ({
		page,
		browser
	}) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const statusBody = (await (await page.request.get('/api/availability/status/me')).json()) as {
			data: { availability: { expiresAt: string } };
		};
		const expiresAt = new Date(statusBody.data.availability.expiresAt);
		const warnAt = new Date(expiresAt.getTime() - 15 * 60_000);
		const sweepAt = new Date(expiresAt.getTime() + 1_000);

		const warnTick = await page.request.post('/api/dev/availability-tick', {
			data: { now: warnAt.toISOString() }
		});
		expect(warnTick.ok(), await warnTick.text()).toBeTruthy();

		const anonBefore = await browser.newContext();
		const anonBeforePage = await anonBefore.newPage();
		await anonBeforePage.goto('/');
		await expect(anonBeforePage.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
		await expect(
			anonBeforePage.locator(`a[href="/provider/${profileId}"]`).first().getByText('Available now')
		).toBeVisible({ timeout: 15_000 });
		await anonBefore.close();

		const sweepTick = await page.request.post('/api/dev/availability-tick', {
			data: { now: sweepAt.toISOString() }
		});
		expect(sweepTick.ok(), await sweepTick.text()).toBeTruthy();
		const sweepBody = (await sweepTick.json()) as { data: { expired: number } };
		expect(sweepBody.data.expired).toBeGreaterThanOrEqual(1);

		const clearedStatus = (await (
			await page.request.get('/api/availability/status/me')
		).json()) as { data: { availability: { state: string } } };
		expect(clearedStatus.data.availability.state).toBe('not_available');

		await page.goto('/provider/dashboard');
		await expect(page.getByTestId('availability-renewal-banner')).toHaveCount(0);
		await expect(page.getByTestId('availability-toggle')).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByText('expired', { exact: false })).toHaveCount(0);
		await expect(page.getByText('warning badge', { exact: false })).toHaveCount(0);

		const anonAfter = await browser.newContext();
		const anonAfterPage = await anonAfter.newPage();
		await anonAfterPage.goto('/');
		await expect(anonAfterPage.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
		await expect(
			anonAfterPage.locator(`a[href="/provider/${profileId}"]`).first().getByText('Available now')
		).toHaveCount(0);
		await anonAfter.close();

		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});
