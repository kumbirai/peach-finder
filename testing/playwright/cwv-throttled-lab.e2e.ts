import { expect, test } from '@playwright/test';
import {
	CWV_CLS_MAX,
	homepageInteractiveBudgetMs,
	profileNavigationBudgetMs
} from '../../src/lib/performance/cwv-budgets';
import { applyCwvLab, readPageWebVitals } from './cwv-lab';
import { assertPrimaryListingLive } from './live-backend-assert';

test.describe('throttled CWV lab', () => {
	test('homepage first paint and profile navigation stay within the lab budget', async ({
		page,
		request
	}) => {
		await applyCwvLab(page);
		const homeStarted = Date.now();
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		const homeMs = Date.now() - homeStarted;
		const vitals = await readPageWebVitals(page);
		expect(vitals.fcpMs).not.toBeNull();
		expect(vitals.fcpMs ?? Number.POSITIVE_INFINITY).toBeLessThan(homepageInteractiveBudgetMs());
		expect(homeMs).toBeLessThan(homepageInteractiveBudgetMs());
		expect(vitals.cls).toBeLessThanOrEqual(CWV_CLS_MAX);
		await assertPrimaryListingLive(request);

		const profileHref = await page
			.locator('a.profile-link[href^="/provider/"]')
			.last()
			.getAttribute('href');
		expect(profileHref).toBeTruthy();
		const navStarted = Date.now();
		await page.goto(profileHref as string);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(Date.now() - navStarted).toBeLessThan(profileNavigationBudgetMs());
		await assertPrimaryListingLive(request);
	});
});
