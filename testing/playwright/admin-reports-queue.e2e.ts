import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD
} from '../../scripts/seed-core';
import {
	SEED_REPORT_ACT_OPEN_ID,
	SEED_REPORT_NEW_OPEN_ID,
	SEED_REPORT_OLD_OPEN_ID,
	SEED_REPORT_THREAD_ID
} from '../../scripts/seed-reports-constants';

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

async function signInSeeker(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=%2Fprofile');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
}

async function readProfileSnapshot(
	request: import('@playwright/test').APIRequestContext,
	profileId: string
) {
	const res = await request.get(`/api/provider/profile/${profileId}`);
	expect(res.ok()).toBeTruthy();
	return (await res.json()) as {
		data: {
			displayName: string;
			badges: { identityVerified: boolean; activeThisWeek: boolean };
		};
	};
}

async function dispatchUntilNotification(
	request: import('@playwright/test').APIRequestContext,
	category: string
): Promise<boolean> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const dispatchRes = await request.post('/api/dev/notification-dispatch');
		expect(dispatchRes.ok()).toBeTruthy();
		const notifRes = await request.get('/api/notifications/in-app');
		expect(notifRes.ok()).toBeTruthy();
		const notifBody = (await notifRes.json()) as {
			data: Array<{ category: string }>;
		};
		if (notifBody.data.some((n) => n.category === category)) return true;
	}
	return false;
}

test.describe.configure({ mode: 'serial' });

test.describe('US-ADMIN-03 work the reports queue to human resolution', () => {
	test('TC-ADMIN-03a: queue shows reporter, party, thread content, and history', async ({
		page,
		request
	}) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto('/admin/reports');
		await expect(page.getByTestId('admin-reports-queue')).toBeVisible();

		const items = page.getByTestId('reports-queue-item');
		await expect(items.first()).toHaveAttribute('data-report-id', SEED_REPORT_OLD_OPEN_ID);
		await expect(page.getByTestId('report-context').first()).toBeVisible();
		await expect(page.getByTestId('report-thread-context')).toBeVisible();
		await expect(page.getByTestId('report-history').first()).toBeVisible();
	});

	test('TC-ADMIN-03c: unrelated thread messages are unreachable without a filed report', async ({
		request
	}) => {
		await signInAdmin(request);
		const unrelated = await request.get(`/admin/api/trust/reports/${SEED_REPORT_OLD_OPEN_ID}`);
		expect(unrelated.ok()).toBeTruthy();
		const body = (await unrelated.json()) as { data: { targetType: string } };
		expect(body.data.targetType).not.toBe('thread');

		const blocked = await request.get(`/api/messaging/threads/${SEED_REPORT_THREAD_ID}/messages`);
		expect(blocked.status()).toBeGreaterThanOrEqual(400);
	});

	test('admin dismiss and act paths notify reporters; profile unchanged until act', async ({
		request,
		browser
	}) => {
		test.setTimeout(120_000);

		const seekerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		await signInSeeker(seekerPage);
		const seekerRequest = seekerPage.request;

		const beforePrimary = await readProfileSnapshot(seekerRequest, SEED_CORE_PRIMARY_PROFILE_ID);

		await signInAdmin(request);
		const dismiss = await request.post(
			`/admin/api/trust/reports/${SEED_REPORT_NEW_OPEN_ID}/dismiss`,
			{ data: { note: 'Reviewed — no policy violation.' } }
		);
		expect(dismiss.ok(), await dismiss.text()).toBeTruthy();
		await request.post('/api/dev/notification-dispatch');

		const midPrimary = await readProfileSnapshot(seekerRequest, SEED_CORE_PRIMARY_PROFILE_ID);
		expect(midPrimary.data.displayName).toBe(beforePrimary.data.displayName);
		expect(midPrimary.data.badges).toEqual(beforePrimary.data.badges);

		const act = await request.post(`/admin/api/trust/reports/${SEED_REPORT_ACT_OPEN_ID}/act`, {
			data: { action: 'unpublish', reason: 'Verified safety concern after review.' }
		});
		expect(act.ok(), await act.text()).toBeTruthy();
		await request.post('/api/dev/notification-dispatch');

		expect(await dispatchUntilNotification(seekerRequest, 'report_resolution')).toBeTruthy();

		const hidden = await seekerRequest.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(hidden.status()).toBeGreaterThanOrEqual(400);

		await seekerContext.close();
	});

	test('reports queue page has no critical or serious axe violations', async ({
		page,
		request
	}) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto('/admin/reports');
		const results = await new AxeBuilder({ page })
			.include('[data-testid="admin-reports-queue"]')
			.exclude('[data-testid="report-profile-context"]')
			.analyze();
		expect(
			results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toEqual([]);
	});
});
