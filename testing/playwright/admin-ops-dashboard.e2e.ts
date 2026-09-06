import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } from '../../scripts/seed-core';

async function signInAdmin(request: import('@playwright/test').APIRequestContext) {
	const login = await request.post('/admin/api/identity/login', {
		data: { email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }
	});
	expect(login.ok()).toBeTruthy();
	const loginBody = (await login.json()) as { data: { devTotpCode?: string } };
	const totp = await request.post('/admin/api/identity/login/totp', {
		data: { totpCode: loginBody.data.devTotpCode }
	});
	expect(totp.ok(), await totp.text()).toBeTruthy();
}

test.describe('US-ADMIN-08 see the scaling wall coming', () => {
	test('TC-ADMIN-08a: ops dashboard reflects real queue state', async ({ page, request }) => {
		await signInAdmin(request);

		const [identityRes, reportsRes, kpisRes] = await Promise.all([
			request.get('/admin/api/trust/verification/queue'),
			request.get('/admin/api/trust/reports/queue'),
			request.get('/admin/api/ops/kpis?range=7d')
		]);
		expect(identityRes.ok(), await identityRes.text()).toBeTruthy();
		expect(reportsRes.ok(), await reportsRes.text()).toBeTruthy();
		expect(kpisRes.ok(), await kpisRes.text()).toBeTruthy();

		const identityBody = (await identityRes.json()) as {
			data: { stats: { pendingCount: number; avgAgeHours: number | null } };
		};
		const reportsBody = (await reportsRes.json()) as {
			data: { stats: { openCount: number; avgAgeHours: number | null } };
		};
		const kpisBody = (await kpisRes.json()) as {
			data: {
				identityQueue: { pendingCount: number; avgAgeHours: number | null };
				reportsQueue: { openCount: number; avgAgeHours: number | null };
				registrations: { count: number };
				activeListings: number;
				registrationRangeLabel: string;
			};
		};

		expect(kpisBody.data.identityQueue.pendingCount).toBe(identityBody.data.stats.pendingCount);
		expect(kpisBody.data.reportsQueue.openCount).toBe(reportsBody.data.stats.openCount);
		expect(kpisBody.data.identityQueue.avgAgeHours).toBeCloseTo(
			identityBody.data.stats.avgAgeHours ?? 0,
			5
		);
		expect(kpisBody.data.reportsQueue.avgAgeHours).toBeCloseTo(
			reportsBody.data.stats.avgAgeHours ?? 0,
			5
		);
		expect(kpisBody.data.identityQueue.pendingCount).toBeGreaterThan(0);
		expect(kpisBody.data.reportsQueue.openCount).toBeGreaterThan(0);
		expect(kpisBody.data.activeListings).toBeGreaterThan(0);
		expect(kpisBody.data.registrations.count).toBeGreaterThan(0);
		expect(kpisBody.data.registrationRangeLabel).toBe('last 7 days');

		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto('/admin');

		await expect(page.getByTestId('admin-ops-dashboard')).toBeVisible();
		await expect(
			page
				.getByTestId('kpi-identity-queue')
				.getByText(String(kpisBody.data.identityQueue.pendingCount), { exact: true })
		).toBeVisible();
		await expect(
			page
				.getByTestId('kpi-reports-queue')
				.getByText(String(kpisBody.data.reportsQueue.openCount), { exact: true })
		).toBeVisible();
		await expect(
			page.getByTestId('kpi-registrations').getByText(String(kpisBody.data.registrations.count), {
				exact: true
			})
		).toBeVisible();
		await expect(
			page
				.getByTestId('kpi-active-listings')
				.getByText(String(kpisBody.data.activeListings), { exact: true })
		).toBeVisible();
	});

	test('TC-ADMIN-VIS-02: dense KPI tiles stay on the admin console only', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('admin-ops-dashboard')).toHaveCount(0);
		await expect(page.getByTestId('kpi-identity-queue')).toHaveCount(0);
	});

	test('has no critical or serious axe violations on the ops dashboard', async ({
		page,
		request
	}) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto('/admin');

		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
