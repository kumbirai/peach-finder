import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD } from '../../scripts/seed-core';

const FORBIDDEN_IDENTIFYING_KEYS = [
	'viewerKey',
	'viewer_key',
	'seekerId',
	'seeker_id',
	'userId',
	'user_id',
	'email',
	'displayName',
	'display_name',
	'sessionId',
	'session_id',
	'ipAddress',
	'ip_address',
	'viewer',
	'viewers',
	'seeker',
	'seekers'
] as const;

function collectKeys(value: unknown, keys: Set<string>): void {
	if (value == null || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, keys);
		return;
	}
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		keys.add(key);
		collectKeys(nested, keys);
	}
}

function findForbiddenKeys(payload: unknown): string[] {
	const keys = new Set<string>();
	collectKeys(payload, keys);
	return FORBIDDEN_IDENTIFYING_KEYS.filter((forbidden) => keys.has(forbidden));
}

async function signInAsSeedProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
}

test.describe('US-ANLY-01 my four numbers (live stack)', () => {
	test.beforeEach(async ({ page }) => {
		const seedRes = await page.request.post('/api/dev/analytics-seed');
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();
	});

	test('TC-ANLY-01a: dashboard shows four metrics with trend and comparison', async ({ page }) => {
		await signInAsSeedProvider(page);

		const apiRes = await page.request.get('/api/analytics/dashboard?range=30');
		expect(apiRes.ok(), await apiRes.text()).toBeTruthy();
		const body = (await apiRes.json()) as {
			data: {
				profileViews: { currentTotal: string; trend: unknown[]; priorPeriodComparison: unknown };
				searchAppearances: { currentTotal: string };
				contactRequests: { currentTotal: string };
				mostSearchedServices: Array<{ tag: string }>;
			};
		};

		expect(body.data.profileViews.currentTotal).toBeTruthy();
		expect(body.data.profileViews.trend.length).toBeGreaterThan(0);
		expect(body.data.profileViews.priorPeriodComparison).toBeTruthy();
		expect(body.data.searchAppearances.currentTotal).toBeTruthy();
		expect(body.data.contactRequests.currentTotal).toBeTruthy();
		expect(body.data.mostSearchedServices[0]?.tag).toBeTruthy();

		await expect(page.getByTestId('provider-analytics')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('analytics-profile-views')).not.toHaveText('');
		await expect(page.getByTestId('analytics-most-searched-service')).toContainText(/deep tissue/i);
	});

	test('TC-ANLY-01b: range selector switches between 7/30/90-day ranges', async ({ page }) => {
		await signInAsSeedProvider(page);

		const defaultRes = await page.request.get('/api/analytics/dashboard?range=30');
		const sevenRes = await page.request.get('/api/analytics/dashboard?range=7');
		const ninetyRes = await page.request.get('/api/analytics/dashboard?range=90');

		expect(defaultRes.ok()).toBeTruthy();
		expect(sevenRes.ok()).toBeTruthy();
		expect(ninetyRes.ok()).toBeTruthy();

		const defaultBody = (await defaultRes.json()) as {
			data: { profileViews: { currentTotal: string } };
		};
		const sevenBody = (await sevenRes.json()) as {
			data: { profileViews: { currentTotal: string } };
		};
		const ninetyBody = (await ninetyRes.json()) as {
			data: { profileViews: { currentTotal: string } };
		};

		expect(defaultBody.data.profileViews.currentTotal).toBeTruthy();
		expect(sevenBody.data.profileViews.currentTotal).toBeTruthy();
		expect(ninetyBody.data.profileViews.currentTotal).toBeTruthy();

		await page.getByTestId('analytics-range-7').click();
		await expect(page).toHaveURL(/range=7/);
		await page.getByTestId('analytics-range-90').click();
		await expect(page).toHaveURL(/range=90/);
	});

	test('TC-ANLY-01c: metric definitions are shown in-product', async ({ page }) => {
		await signInAsSeedProvider(page);
		await expect(page.getByTestId('analytics-definitions')).toBeVisible();
		await page.getByTestId('analytics-definitions').locator('summary').click();
		await expect(page.getByText(/profile-page load by anyone other than you/i)).toBeVisible();
		await expect(page.getByText(/card shown in a search or homepage results set/i)).toBeVisible();
		await expect(page.getByText(/new message thread started with you/i)).toBeVisible();

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="provider-analytics"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});

test.describe('US-ANLY-03 demand signal I can act on (live stack)', () => {
	test('TC-ANLY-03a: trending tags shown with owned tags visually distinguished', async ({
		page
	}) => {
		const seedRes = await page.request.post('/api/dev/analytics-seed?scenario=demand-signal');
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();
		await signInAsSeedProvider(page);

		const apiRes = await page.request.get('/api/analytics/dashboard?range=30');
		expect(apiRes.ok(), await apiRes.text()).toBeTruthy();
		const body = (await apiRes.json()) as {
			data: {
				mostSearchedServices: Array<{ tag: string; isMine: boolean; demandRank: number }>;
			};
		};

		expect(body.data.mostSearchedServices[0]?.tag).toMatch(/deep tissue/i);
		expect(body.data.mostSearchedServices[0]?.isMine).toBe(false);
		const swedish = body.data.mostSearchedServices.find((row) => /swedish/i.test(row.tag));
		expect(swedish?.isMine).toBe(true);

		await expect(page.getByTestId('analytics-demand-signals')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('analytics-most-searched-service')).toContainText(/deep tissue/i);
		await expect(page.getByTestId('analytics-most-searched-ownership')).toHaveText(
			'Not on your profile'
		);
		await expect(
			page.getByTestId('analytics-demand-tag-01900000-0000-7000-8000-000000000202')
		).toContainText('Your tag');
		await expect(
			page.getByTestId('analytics-demand-tag-01900000-0000-7000-8000-000000000201')
		).toContainText('Not on your profile');

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="analytics-demand-signals"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});

test.describe('US-ANLY-02 aggregate always, identifiable never (live stack)', () => {
	test('TC-ANLY-02a: analytics API and dashboard UI expose no per-viewer identification', async ({
		page
	}) => {
		const seedRes = await page.request.post('/api/dev/analytics-seed');
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();
		await signInAsSeedProvider(page);

		const apiRes = await page.request.get('/api/analytics/dashboard?range=30');
		expect(apiRes.ok(), await apiRes.text()).toBeTruthy();
		const body = (await apiRes.json()) as { data: unknown };
		expect(findForbiddenKeys(body.data)).toEqual([]);
		expect(JSON.stringify(body.data)).not.toMatch(/viewer_key|viewerKey|seekerId|seeker_id/);

		await expect(page.getByTestId('provider-analytics')).toBeVisible({ timeout: 15_000 });
		const analyticsText = await page.getByTestId('provider-analytics').innerText();
		expect(analyticsText).not.toMatch(/seeker@example\.com|response-seeker-/i);
		expect(analyticsText).not.toMatch(/viewer_key|seekerId/i);

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="provider-analytics"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});

	test('TC-ANLY-02b: small counts display as "< 5" on API and dashboard UI', async ({ page }) => {
		const seedRes = await page.request.post('/api/dev/analytics-seed?scenario=privacy-floor');
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();
		await signInAsSeedProvider(page);

		const apiRes = await page.request.get('/api/analytics/dashboard?range=7');
		expect(apiRes.ok(), await apiRes.text()).toBeTruthy();
		const body = (await apiRes.json()) as {
			data: {
				profileViews: {
					currentTotal: string;
					trend: Array<{ value: string }>;
					priorPeriodComparison: { changeLabel: string };
				};
				searchAppearances: { currentTotal: string };
				contactRequests: { currentTotal: string };
			};
		};

		expect(body.data.profileViews.currentTotal).toBe('< 5');
		expect(body.data.profileViews.priorPeriodComparison.changeLabel).not.toMatch(/%/);
		expect(body.data.searchAppearances.currentTotal).toBe('< 5');
		expect(body.data.contactRequests.currentTotal).toBe('< 5');
		expect(body.data.profileViews.currentTotal).not.toBe('3');
		for (const point of body.data.profileViews.trend) {
			expect(point.value).toBe('< 5');
		}

		await expect(page.getByTestId('analytics-profile-views')).toHaveText('< 5');
		await expect(page.getByTestId('analytics-search-appearances')).toHaveText('< 5');
		await expect(page.getByTestId('analytics-contact-requests')).toHaveText('< 5');
		await expect(page.getByTestId('analytics-profile-views')).not.toHaveText('3');
	});
});
