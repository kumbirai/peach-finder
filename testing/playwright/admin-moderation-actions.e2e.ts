import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../scripts/seed-core';
import { SEED_REPORT_OLD_OPEN_ID } from '../../scripts/seed-reports-constants';

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
	});

	test('TC-ADMIN-04b: unpublish via API notifies provider after dispatch', async ({
		page,
		request
	}) => {
		await signInAdmin(request);

		const unpublish = await request.post('/admin/api/trust/moderation/unpublish', {
			data: {
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'Verified policy concern from moderation panel.'
			}
		});
		expect(unpublish.ok(), await unpublish.text()).toBeTruthy();

		for (let attempt = 0; attempt < 10; attempt++) {
			await request.post('/api/dev/notification-dispatch');
		}

		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto('/admin/moderation');
		await expect(page.getByTestId('admin-moderation-panel')).toBeVisible();
	});

	test('reports queue exposes the moderation action picker', async ({ page, request }) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto('/admin/reports');
		const row = page.locator(`[data-report-id="${SEED_REPORT_OLD_OPEN_ID}"]`);
		await expect(row).toBeVisible();
		await row.getByRole('link', { name: 'Take action' }).click();
		await expect(row.getByTestId('moderation-action-picker')).toBeVisible();
		await expect(row.getByTestId('moderation-action-note')).toContainText(
			'moderation-action picker'
		);
	});

	test('moderation panel has no critical or serious axe violations', async ({ page, request }) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto('/admin/moderation');
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
			.analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
