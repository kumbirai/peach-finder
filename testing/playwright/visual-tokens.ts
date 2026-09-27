import { expect, type Page } from '@playwright/test';
import { isTerracottaFocusColor, isWarmOrInkShadow } from '../../src/lib/design/palette';
import { assertPrimaryListingLive } from './live-backend-assert';

export async function assertOneSerifAndNoAdminInk(page: Page): Promise<void> {
	const h1Family = await page
		.getByRole('heading', { level: 1 })
		.evaluate((el) => getComputedStyle(el).fontFamily);
	expect(h1Family).toMatch(/Fraunces/i);
	const bodyFamily = await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily);
	expect(bodyFamily).not.toMatch(/Fraunces/i);
	await expect(page.locator('[data-admin-ink-strip]')).toHaveCount(0);
}

export async function assertPrimaryTouchTarget(page: Page): Promise<void> {
	const message = page.locator('a.btn-primary, button.btn-primary').first();
	await expect(message).toBeVisible();
	const box = await message.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	const radius = await message.evaluate((el) => getComputedStyle(el).borderRadius);
	expect(parseFloat(radius) >= 999 || radius.includes('999')).toBe(true);
}

export async function assertWarmCardShadow(page: Page): Promise<void> {
	const card = page.locator('article.card, .card').first();
	if ((await card.count()) === 0) return;
	await expect(card).toBeVisible();
	const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
	expect(isWarmOrInkShadow(shadow), shadow).toBe(true);
}

export async function assertTerracottaFocusRing(page: Page): Promise<void> {
	const target = page.locator('a.btn-primary, button.btn-primary').first();
	await target.focus();
	const outline = await target.evaluate((el) => getComputedStyle(el).outlineColor);
	expect(isTerracottaFocusColor(outline), outline).toBe(true);
}

export async function assertNeverColorAloneOnPills(page: Page): Promise<void> {
	const pill = page.locator('[data-component="availability-pill"]').first();
	if ((await pill.count()) === 0) return;
	await expect(pill.locator('.text')).toBeVisible();
}

export async function assertSeekSurfaceTokens(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await assertOneSerifAndNoAdminInk(page);
	await assertPrimaryTouchTarget(page);
	await assertWarmCardShadow(page);
	await assertTerracottaFocusRing(page);
	await assertNeverColorAloneOnPills(page);
	await assertPrimaryListingLive(page.request);
}
