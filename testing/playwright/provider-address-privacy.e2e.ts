import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD
} from '../../scripts/seed-core';

const STREET_ADDRESS_LABELS = [
	'Street address',
	'Street',
	'Physical address',
	'Exact address',
	'Address line'
];

async function createGeotaggedJpeg(): Promise<Buffer> {
	const stamp = Date.now();
	return sharp({
		create: {
			width: 96 + (stamp % 17),
			height: 96 + (stamp % 13),
			channels: 3,
			background: { r: 180 + (stamp % 40), g: 140, b: 100 }
		}
	})
		.jpeg()
		.withMetadata({
			exif: {
				IFD0: { Make: 'E2EFixtureCam' },
				IFD3: {
					GPSLatitude: '26/1',
					GPSLatitudeRef: 'S',
					GPSLongitude: '28/1',
					GPSLongitudeRef: 'E'
				}
			}
		})
		.toBuffer();
}

async function signInAsSeedProvider(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/sign-in?flow=sign-in&returnTo=%2Fmessages');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.locator('form button[type="submit"]').click();
	await expect(page).toHaveURL(/\/messages/, { timeout: 15_000 });
	await page.getByRole('link', { name: 'Provider', exact: true }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

test.describe('US-PRIV-02 my address is not in the system', () => {
	test('TC-PRIV-02a: provider forms expose area only, never a street-address field', async ({
		page
	}) => {
		await page.goto('/provider/register');
		await expect(page.getByLabel('General service area')).toBeVisible();
		for (const label of STREET_ADDRESS_LABELS) {
			await expect(page.getByLabel(label)).toHaveCount(0);
		}
		await expect(page.locator('input[name="street"]')).toHaveCount(0);
		await expect(page.locator('input[name="address"]')).toHaveCount(0);
		await expect(
			page.getByText('Only your general suburb or area is ever shown publicly')
		).toBeVisible();

		await signInAsSeedProvider(page);
		await page.goto('/provider/onboarding?step=area');
		await expect(page.getByRole('heading', { name: 'Confirm your general area' })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.locator('#areaField')).toBeVisible();
		for (const label of STREET_ADDRESS_LABELS) {
			await expect(page.getByLabel(label)).toHaveCount(0);
		}
		await expect(page.getByRole('note')).toContainText(
			'exact address is never displayed or stored'
		);

		const apiRes = await page.request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(apiRes.ok()).toBeTruthy();
		const apiBody = (await apiRes.json()) as { data: Record<string, unknown> };
		expect('address' in apiBody.data).toBe(false);
		expect('street' in apiBody.data).toBe(false);
		expect('streetAddress' in apiBody.data).toBe(false);
		expect(apiBody.data.area).toBeTruthy();
	});

	test('TC-PRIV-02b: uploaded photos lose GPS EXIF after processing', async ({ page }) => {
		await signInAsSeedProvider(page);

		const geotagged = await createGeotaggedJpeg();
		const sourceMeta = await sharp(geotagged).metadata();
		expect(sourceMeta.exif?.length).toBeGreaterThan(0);

		const uploadRes = await page.request.post('/api/media/uploads', {
			multipart: {
				file: { name: 'studio.jpg', mimeType: 'image/jpeg', buffer: geotagged },
				scope: 'message_attachment'
			}
		});
		expect(
			uploadRes.ok(),
			`upload failed: ${uploadRes.status()} ${await uploadRes.text()}`
		).toBeTruthy();
		const uploadBody = (await uploadRes.json()) as { data: { photoId: string } };

		const statusRes = await page.request.get(`/api/media/uploads/${uploadBody.data.photoId}`);
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: { status: string; variantUrls?: Record<string, string> };
		};
		expect(statusBody.data.status).toBe('ready');
		expect(statusBody.data.variantUrls).toBeTruthy();

		for (const url of Object.values(statusBody.data.variantUrls ?? {})) {
			const mediaRes = await page.request.get(url);
			expect(mediaRes.ok()).toBeTruthy();
			const bytes = Buffer.from(await mediaRes.body());
			const meta = await sharp(bytes).metadata();
			expect(meta.exif).toBeUndefined();
			expect(meta.iptc).toBeUndefined();
			expect(meta.xmp).toBeUndefined();
		}
	});

	test('provider register and onboarding area step have no critical or serious axe violations', async ({
		page
	}) => {
		await page.goto('/provider/register');
		let results = await new AxeBuilder({ page }).analyze();
		let serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);

		await signInAsSeedProvider(page);
		await page.goto('/provider/onboarding?step=area');
		await expect(page.getByRole('heading', { name: 'Confirm your general area' })).toBeVisible({
			timeout: 15_000
		});
		results = await new AxeBuilder({ page }).analyze();
		serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
		expect(serious).toEqual([]);
	});
});
