import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

const SEED_AVAILABLE_ORDER = [
	'Lerato K.',
	'Amara T.',
	'Kagiso L.',
	'Thandi M.',
	'Boitumelo H.',
	'Jordan B.',
	'Sipho N.',
	'Refilwe G.'
];

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
	const email = `e2e-disc01-${stamp}@example.com`;
	const password = 'password123';
	const phone = `083${String(stamp).slice(-7)}`;

	await page.goto('/provider/register');
	await page.getByLabel('Your name').fill('Disc01 E2E');
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
	await page.locator('#introField').fill('Homepage recency E2E therapist profile.');
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
	return { profileId: meBody.data.profileId, displayName: 'Disc01 E2E' };
}

const SEED_UNAVAILABLE_NAMES = ['Nomsa P.', 'Zanele D.', 'Ayanda R.', 'Naledi S.', 'Mandla Z.'];

function indexOfName(names: string[], target: string): number {
	return names.findIndex((name) => name === target);
}

test.describe('US-DISC-01 homepage available now', () => {
	test('TC-DISC-01a: available cohort ordered by recency appears first', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 2, name: /\d+ available now/i })).toBeVisible();

		const cardNames = await page.locator('article.card .title').allTextContents();
		for (let i = 0; i < SEED_AVAILABLE_ORDER.length - 1; i += 1) {
			const left = indexOfName(cardNames, SEED_AVAILABLE_ORDER[i]!);
			const right = indexOfName(cardNames, SEED_AVAILABLE_ORDER[i + 1]!);
			expect(left).toBeGreaterThanOrEqual(0);
			expect(right).toBeGreaterThanOrEqual(0);
			expect(left).toBeLessThan(right);
		}

		const availableSeedIndexes = SEED_AVAILABLE_ORDER.map((name) => indexOfName(cardNames, name));
		const unavailableSeedIndexes = SEED_UNAVAILABLE_NAMES.map((name) =>
			indexOfName(cardNames, name)
		).filter((index) => index >= 0);
		if (unavailableSeedIndexes.length > 0) {
			expect(Math.max(...availableSeedIndexes)).toBeLessThan(Math.min(...unavailableSeedIndexes));
		}

		const availableCount = Number(
			(
				await page.getByRole('heading', { level: 2, name: /\d+ available now/i }).textContent()
			)?.match(/(\d+)/)?.[1] ?? '0'
		);
		for (let i = 0; i < availableCount; i += 1) {
			await expect(
				page
					.locator('article.card')
					.nth(i)
					.getByText(/Available now — updated/i)
			).toBeVisible();
		}
	});

	test('TC-DISC-01b: remaining providers always shown below, never empty', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText(/therapists found/i)).toBeVisible();
		await expect(page.locator('article.card').first()).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: /available now/i })).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: /more therapists nearby/i })
		).toBeVisible();
		await expect(page.getByText('No therapists match those filters.')).toHaveCount(0);
	});

	test('TC-DISC-01c: recency phrasing on available cards and freshness after set', async ({
		page,
		browser
	}) => {
		await page.goto('/');
		await expect(
			page
				.locator('article.card')
				.first()
				.getByText(/Available now — updated/i)
		).toBeVisible();

		const { profileId, displayName } = await registerAndPublishProvider(page);
		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await anonPage.goto('/');
		const card = anonPage.locator(`a[href="/provider/${profileId}"]`).first();
		await expect(card).toBeVisible({ timeout: 15_000 });
		await expect(card.getByText(/Available now — updated just now/i)).toBeVisible({
			timeout: 15_000
		});
		await expect(anonPage.locator('article.card').first()).toContainText(displayName);
		await anonContext.close();
	});

	test('TC-DISC-01d: SSR meaningful content and interactivity budget', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		const response = await page.goto('/');
		expect(response?.ok()).toBe(true);

		const html = await page.content();
		expect(html).toContain('Find relief, right now.');
		expect(html).toContain('Lerato K.');
		expect(html).toContain('available now');
		await context.close();

		const interactive = await browser.newPage();
		const started = Date.now();
		await interactive.goto('/');
		await interactive.getByRole('heading', { level: 1 }).waitFor();
		await interactive.locator('article.card').first().waitFor();
		expect(Date.now() - started).toBeLessThan(3_000);
	});

	test('has no critical or serious axe violations', async ({ page }) => {
		await page.goto('/');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
