import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';
import { BADGE_EXPLANATIONS, SAFETY_PAGE_PATH } from '../../src/lib/trust-badges';

test.describe('US-VIEW-04 badges that explain themselves', () => {
	test('TC-VIEW-04a: only Identity verified and Active this week trust badges render', async ({
		page
	}) => {
		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const badges = page.getByTestId('profile-trust-badges');
		await expect(badges.getByTestId('trust-badge-verified')).toBeVisible();
		await expect(badges.getByTestId('trust-badge-active-week')).toBeVisible();
		await expect(badges.locator('[data-kind="verified"]')).toHaveCount(1);
		await expect(badges.locator('[data-kind="active-week"]')).toHaveCount(1);

		await page.goto('/');
		const cardBadges = page.locator('.badges [data-component="badge"][data-kind]');
		const kinds = await cardBadges.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute('data-kind'))
		);
		for (const kind of kinds) {
			expect(['verified', 'active-week']).toContain(kind);
		}
	});

	test('TC-VIEW-04b: tap reveals explanation and badge links to safety page', async ({ page }) => {
		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const verified = page.getByTestId('trust-badge-verified');
		await expect(verified).toHaveAttribute('href', SAFETY_PAGE_PATH);

		await verified.hover();
		await expect(verified.locator('.explanation')).toBeVisible();
		await expect(verified.locator('.explanation')).toHaveText(BADGE_EXPLANATIONS.verified);

		const activeWeek = page.getByTestId('trust-badge-active-week');
		await activeWeek.hover();
		await expect(activeWeek.locator('.explanation')).toBeVisible();
		await expect(activeWeek.locator('.explanation')).toHaveText(BADGE_EXPLANATIONS['active-week']);

		await verified.click();
		await expect(verified).toHaveAttribute('data-expanded', 'true');
		await verified.click();
		await page.waitForURL(`**${SAFETY_PAGE_PATH}`);
		await expect(page.getByTestId('safety-page')).toBeVisible();
		await expect(page.getByTestId('safety-badge-meanings')).toContainText('Identity verified');
		await expect(page.getByTestId('safety-badge-meanings')).toContainText('Active this week');
	});

	test('GET /api/trust/safety-info returns configured HTML', async ({ request }) => {
		const res = await request.get('/api/trust/safety-info');
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { data: { html: string } };
		expect(body.data.html).toContain('Meet in a public');
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
