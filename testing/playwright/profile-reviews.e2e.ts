import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_VIEW_05_EDITED_REVIEW_BODY,
	SEED_VIEW_05_NEWEST_REVIEWER_LABEL,
	SEED_VIEW_05_REPLY_BODY,
	SEED_VIEW_05_REVIEW_COUNT
} from '../../scripts/seed-core';

test.describe('US-VIEW-05 reviews I can weigh', () => {
	test('TC-VIEW-05a: review list fields and newest-first ordering', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		const apiRes = await page.request.get(`/api/reviews/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(apiRes.ok()).toBeTruthy();
		const apiBody = (await apiRes.json()) as {
			data: Array<{ reviewerName: string; dateLabel: string }>;
		};
		expect(apiBody.data).toHaveLength(SEED_VIEW_05_REVIEW_COUNT);
		expect(apiBody.data[0]?.reviewerName).toBe(SEED_VIEW_05_NEWEST_REVIEWER_LABEL);
		expect(JSON.stringify(apiBody)).not.toMatch(/T\d{2}:\d{2}/);

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await expect(page.getByTestId('profile-reviews')).toBeVisible();
		await expect(page.getByTestId('profile-rating')).toContainText('4.9');
		await expect(page.getByTestId('profile-rating')).toContainText('128 reviews');

		const reviewItems = page.getByTestId('profile-review-item');
		await expect(reviewItems).toHaveCount(SEED_VIEW_05_REVIEW_COUNT);
		await expect(reviewItems.first().getByTestId('profile-review-name')).toHaveText(
			SEED_VIEW_05_NEWEST_REVIEWER_LABEL
		);
		await expect(reviewItems.first().getByTestId('profile-review-date')).toHaveText(
			/September 2026/
		);
		expect(await reviewItems.first().getByTestId('profile-review-date').innerText()).not.toMatch(
			/\d{1,2} [A-Za-z]+ 2026/
		);

		const html = await page.content();
		expect(html).not.toMatch(/2026-09-01T/);

		await context.close();
	});

	test('TC-VIEW-05b: edited marker and provider reply render beneath review', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);

		await expect(page.getByText(SEED_VIEW_05_EDITED_REVIEW_BODY)).toBeVisible();
		await expect(
			page.getByTestId('profile-review-edited').filter({ hasText: 'edited' })
		).toBeVisible();
		await expect(
			page.getByTestId('profile-review-reply').filter({ hasText: SEED_VIEW_05_REPLY_BODY })
		).toBeVisible();

		const axe = await new AxeBuilder({ page }).include('[data-testid="profile-reviews"]').analyze();
		const serious = axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
		expect(serious).toEqual([]);

		await context.close();
	});
});
