import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../scripts/seed-core';
import {
	SEED_SAFE02_AMARA_EMAIL,
	SEED_SAFE02_AMARA_PASSWORD
} from '../../scripts/seed-blocking-constants';
import { assertPrimaryListingLive } from './live-backend-assert';
import {
	SEED_REPORT_ACT_OPEN_ID,
	SEED_REPORT_DISMISSED_ID,
	SEED_REPORT_NEW_OPEN_ID,
	SEED_REPORT_OLD_OPEN_ID,
	SEED_REPORT_THREAD_OPEN_ID
} from '../../scripts/seed-reports-constants';

const SEEDED_REPORT_IDS = new Set([
	SEED_REPORT_OLD_OPEN_ID,
	SEED_REPORT_NEW_OPEN_ID,
	SEED_REPORT_THREAD_OPEN_ID,
	SEED_REPORT_ACT_OPEN_ID,
	SEED_REPORT_DISMISSED_ID
]);

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

async function signInProvider(
	page: import('@playwright/test').Page,
	email: string,
	password: string
) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/dashboard');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
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

async function restorePrimaryListing(
	browser: import('@playwright/test').Browser
): Promise<void> {
	const restoreContext = await browser.newContext();
	const restorePage = await restoreContext.newPage();
	await signInProvider(restorePage, SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD);
	const restoreLive = await restorePage.request.get(
		`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
	);
	if (!restoreLive.ok()) {
		const restorePublish = await restorePage.request.post('/api/provider/profile/publish');
		expect(restorePublish.ok(), await restorePublish.text()).toBeTruthy();
	}
	await restoreContext.close();
}

test.describe('US-ADMIN-04 the only hands that take content down', () => {
	test('TC-ADMIN-04a: moderation panel blocks action without a reason', async ({
		page,
		request
	}) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto('/admin/moderation');
		await expect(page.getByTestId('admin-moderation-panel')).toBeVisible();

		await page.getByLabel('Provider profile ID').fill(SEED_CORE_PRIMARY_PROFILE_ID);
		await page.getByLabel('Reason').fill('   ');
		await page.getByRole('button', { name: 'Record action' }).click();
		await expect(page.getByRole('alert')).toContainText(/reason/i);

		const stillLive = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(stillLive.ok()).toBeTruthy();
		const search = await request.get('/api/discovery/search');
		expect(search.ok()).toBeTruthy();
		const searchBody = (await search.json()) as {
			data: Array<{ providerProfileId: string }>;
		};
		expect(searchBody.data.map((card) => card.providerProfileId)).toContain(
			SEED_CORE_PRIMARY_PROFILE_ID
		);
	});

	test('TC-ADMIN-04b: unpublish via API notifies provider after dispatch', async ({
		page,
		request,
		browser
	}) => {
		test.setTimeout(90_000);
		await restorePrimaryListing(browser);

		await signInAdmin(request);

		const liveBefore = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(liveBefore.ok()).toBeTruthy();

		const unpublish = await request.post('/admin/api/trust/moderation/unpublish', {
			data: {
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'Verified policy concern from moderation panel.'
			}
		});
		expect(unpublish.ok(), await unpublish.text()).toBeTruthy();

		const effect = await request.post('/api/dev/moderation-effect-dispatch');
		expect(effect.ok(), await effect.text()).toBeTruthy();

		const publicContext = await browser.newContext();
		const publicPage = await publicContext.newPage();
		const hidden = await publicPage.request.get(
			`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(hidden.status()).toBeGreaterThanOrEqual(400);
		const searchAfter = await publicPage.request.get('/api/discovery/search');
		const searchBody = (await searchAfter.json()) as {
			data: Array<{ providerProfileId: string }>;
		};
		expect(searchBody.data.map((card) => card.providerProfileId)).not.toContain(
			SEED_CORE_PRIMARY_PROFILE_ID
		);
		await publicContext.close();

		const providerContext = await browser.newContext();
		const providerPage = await providerContext.newPage();
		try {
			await signInProvider(providerPage, SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD);
			expect(
				await dispatchUntilNotification(providerPage.request, 'moderation_outcome')
			).toBeTruthy();
			await providerPage.goto('/profile');
			await expect(
				providerPage.locator('[data-notification-category="moderation_outcome"]').first()
			).toBeVisible({ timeout: 15_000 });
		} finally {
			const republish = await providerPage.request.post('/api/provider/profile/publish');
			expect(republish.ok(), await republish.text()).toBeTruthy();
			await expect
				.poll(async () => {
					const restoredContext = await browser.newContext();
					const restoredPage = await restoredContext.newPage();
					const restored = await restoredPage.request.get(
						`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
					);
					const status = restored.status();
					await restoredContext.close();
					return status;
				})
				.toBe(200);
			await providerContext.close();
		}

		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto('/admin/moderation');
		await expect(page.getByTestId('admin-moderation-panel')).toBeVisible();
	});

	test('reports queue exposes the moderation action picker', async ({
		page,
		request,
		browser
	}) => {
		test.setTimeout(120_000);
		await restorePrimaryListing(browser);

		const seekerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const email = `picker-act-${Date.now()}@example.com`;
		await seekerPage.goto('/sign-in?returnTo=/profile');
		await seekerPage.getByLabel('Your name').fill('Picker Act Seeker');
		await seekerPage.getByLabel('Email').fill(email);
		await seekerPage.getByLabel('Password').fill('password123');
		await seekerPage.locator('input[name="acceptedTerms"]').check();
		await seekerPage.getByRole('button', { name: 'Create account' }).click();
		await expect(seekerPage).toHaveURL(/\/profile/, { timeout: 15_000 });
		let tokenRes = await seekerPage.request.post('/api/dev/verification-token', {
			data: { email }
		});
		if (!tokenRes.ok()) {
			await seekerPage.waitForTimeout(500);
			tokenRes = await seekerPage.request.post('/api/dev/verification-token', { data: { email } });
		}
		expect(tokenRes.ok()).toBeTruthy();
		const { data: tokenData } = (await tokenRes.json()) as { data: { token: string } };
		await seekerPage.goto(`/verify-email?token=${tokenData.token}&returnTo=/profile`);
		await seekerPage.getByRole('button', { name: 'Verify email' }).click();
		await expect(seekerPage).toHaveURL(/\/profile/, { timeout: 15_000 });

		await seekerPage.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}/report`);
		await expect(seekerPage.getByTestId('report-reason-form')).toBeVisible();
		const filed = await seekerPage.request.post('/api/trust/reports', {
			data: {
				targetType: 'profile',
				targetId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'spam_scam'
			}
		});
		expect(filed.status(), await filed.text()).toBe(201);
		await seekerContext.close();

		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto('/admin/reports');
		const seedRow = page.locator(`[data-report-id="${SEED_REPORT_OLD_OPEN_ID}"]`);
		await expect(seedRow).toBeVisible();
		await seedRow.getByRole('link', { name: 'Take action' }).click();
		await expect(seedRow.getByTestId('moderation-action-picker')).toBeVisible();
		await expect(seedRow.getByTestId('moderation-action-note')).toContainText(
			'moderation-action picker'
		);

		const detail = await request.get(`/admin/api/trust/reports/${SEED_REPORT_OLD_OPEN_ID}`);
		expect(detail.ok()).toBeTruthy();
		const detailBody = (await detail.json()) as { data: { reportId: string } };
		expect(detailBody.data.reportId).toBe(SEED_REPORT_OLD_OPEN_ID);
		await expect(seedRow).toBeVisible();
		await seedRow.getByRole('button', { name: 'Cancel' }).click();

		const rows = page.getByTestId('reports-queue-item');
		const count = await rows.count();
		let filedReportId: string | null = null;
		for (let index = 0; index < count; index += 1) {
			const id = await rows.nth(index).getAttribute('data-report-id');
			if (id && !SEEDED_REPORT_IDS.has(id)) {
				filedReportId = id;
				break;
			}
		}
		expect(filedReportId).toBeTruthy();

		await page.goto(`/admin/reports?act=${filedReportId}`);
		const actRow = page.locator(`[data-report-id="${filedReportId}"]`);
		await expect(actRow.getByTestId('moderation-action-picker')).toBeVisible();
		await actRow.getByLabel('Action reason').fill('Verified policy concern from reports picker.');
		await actRow.getByRole('button', { name: 'Confirm Unpublish profile' }).click();
		await expect(actRow).toHaveCount(0, { timeout: 15_000 });

		const acted = await request.get(`/admin/api/trust/reports/${filedReportId}`);
		expect(acted.ok()).toBeTruthy();
		const actedBody = (await acted.json()) as { data: { reportId: string } };
		expect(actedBody.data.reportId).toBe(filedReportId);
		const openQueue = await request.get('/admin/api/trust/reports/queue');
		expect(openQueue.ok()).toBeTruthy();
		const openBody = (await openQueue.json()) as {
			data: { queue: Array<{ reportId: string }> };
		};
		expect(openBody.data.queue.some((item) => item.reportId === filedReportId)).toBe(false);

		const effect = await request.post('/api/dev/moderation-effect-dispatch');
		expect(effect.ok(), await effect.text()).toBeTruthy();

		const publicContext = await browser.newContext();
		const publicPage = await publicContext.newPage();
		const hidden = await publicPage.request.get(
			`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(hidden.status()).toBeGreaterThanOrEqual(400);
		await publicContext.close();

		await restorePrimaryListing(browser);
		await expect
			.poll(async () => {
				const restoredContext = await browser.newContext();
				const restoredPage = await restoredContext.newPage();
				const restored = await restoredPage.request.get(
					`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
				);
				const status = restored.status();
				await restoredContext.close();
				return status;
			})
			.toBe(200);
	});

	test('moderation panel has no critical or serious axe violations', async ({ page, request }) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto('/admin/moderation');
		await assertPrimaryListingLive(page.request);
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
			.analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
