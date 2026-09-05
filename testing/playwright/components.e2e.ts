import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('component gallery', () => {
	test('shows primitives with never-color-alone signals', async ({ page }) => {
		await page.goto('/dev/components');
		const pill = page.locator('[data-component="availability-pill"]');
		await expect(pill).toBeVisible();
		await expect(pill.locator('.text')).toHaveText('Available now');
		const badge = page.locator('[data-kind="verified"]');
		await expect(badge).toBeVisible();
		await expect(badge.locator('.text')).toHaveText('Identity verified');
		await expect(badge).toHaveAttribute('href', '/safety');
		const activeWeek = page.locator('[data-kind="active-week"]');
		await expect(activeWeek).toBeVisible();
		await expect(activeWeek.locator('.text')).toHaveText('Active this week');
		await expect(activeWeek).toHaveAttribute('href', '/safety');
		const tooltipShadow = await badge.evaluate((el) => {
			const tip = el.querySelector('.explanation');
			if (!tip) return 'none';
			const previousDisplay = tip.style.display;
			tip.style.display = 'block';
			const shadow = getComputedStyle(tip).boxShadow;
			tip.style.display = previousDisplay;
			return shadow;
		});
		expect(tooltipShadow).not.toBe('none');
		expect(tooltipShadow).toMatch(/179,\s*70,\s*37/);
		await expect(page.locator('[data-admin-ink-strip]')).toHaveCount(0);
	});

	test('disables availability pulse under reduced motion', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/dev/components');
		const animation = await page
			.locator('[data-component="availability-pill"] .dot')
			.evaluate((el) => getComputedStyle(el).animationName);
		expect(animation === 'none' || animation === '').toBe(true);
	});

	test('has no critical or serious axe violations', async ({ page }) => {
		await page.goto('/dev/components');
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
