import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import { SAFETY_FOOTER_LABEL, SAFETY_PAGE_PATH } from '../../src/lib/trust-badges';

test.describe('US-SAFE-03 know what the badges actually mean', () => {
	test('TC-SAFE-03a: safety page linked from badge area and footer', async ({ page }) => {
		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);

		const verified = page.getByTestId('trust-badge-verified');
		await expect(verified).toHaveAttribute('href', SAFETY_PAGE_PATH);

		const footerLink = page.getByTestId('footer-safety-link');
		await expect(footerLink).toBeVisible();
		await expect(footerLink).toHaveAttribute('href', SAFETY_PAGE_PATH);
		await expect(footerLink).toHaveText(SAFETY_FOOTER_LABEL);

		await footerLink.click();
		await page.waitForURL(`**${SAFETY_PAGE_PATH}`);
		await expect(page.getByTestId('safety-page')).toBeVisible();

		const badgeMeanings = page.getByTestId('safety-badge-meanings');
		await expect(badgeMeanings).toContainText('Identity verified');
		await expect(badgeMeanings).toContainText('Active this week');
		await expect(badgeMeanings).toContainText('does not mean');

		const guidance = page.getByTestId('safety-guidance');
		await expect(guidance).toContainText('Meet in a public');
		await expect(guidance).toContainText('Report anyone');
	});

	test('safety page has no critical or serious axe violations', async ({ page }) => {
		await page.goto(SAFETY_PAGE_PATH);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
