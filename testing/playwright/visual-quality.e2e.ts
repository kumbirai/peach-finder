import { test } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import { assertSeekSurfaceTokens } from './visual-tokens';

test.describe('visual quality tokens (no invented screenshot baselines)', () => {
	test('360px homepage keeps reduced-motion pills, tokens, and live listings', async ({
		page
	}) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await assertSeekSurfaceTokens(page);
		const animation = await page
			.locator('[data-component="availability-pill"]')
			.first()
			.locator('.dot')
			.evaluate((el) => getComputedStyle(el).animationName);
		if (animation !== 'none' && animation !== '') {
			throw new Error(`expected reduced-motion to stop the pill pulse, got ${animation}`);
		}
	});

	test('768px homepage keeps tokens and live listings', async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto('/');
		await assertSeekSurfaceTokens(page);
	});

	test('1280px homepage, filtered search, and seed profile keep tokens and live listings', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await assertSeekSurfaceTokens(page);

		await page.goto('/?verified=1');
		await assertSeekSurfaceTokens(page);

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await assertSeekSurfaceTokens(page);
	});
});
