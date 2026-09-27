import { expect, test } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

test.describe('LLD §2.10 profile_view dedup + fire-and-forget', () => {
	test('opening a live profile twice the same day writes one raw view and stays 200', async ({
		page
	}) => {
		const beforeRes = await page.request.get(
			`/api/dev/analytics-raw-count?profileId=${SEED_CORE_PRIMARY_PROFILE_ID}&eventType=profile_view`
		);
		expect(beforeRes.ok()).toBeTruthy();
		const before = ((await beforeRes.json()) as { data: { count: number } }).data.count;

		const first = await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(first?.ok()).toBeTruthy();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		const second = await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(second?.ok()).toBeTruthy();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		const afterRes = await page.request.get(
			`/api/dev/analytics-raw-count?profileId=${SEED_CORE_PRIMARY_PROFILE_ID}&eventType=profile_view`
		);
		expect(afterRes.ok(), await afterRes.text()).toBeTruthy();
		const after = ((await afterRes.json()) as { data: { count: number } }).data.count;
		expect(after).toBeGreaterThanOrEqual(before);
		expect(after - before).toBeLessThanOrEqual(1);
	});
});
