import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_ADMIN_EMAIL,
	SEED_ADMIN_PASSWORD,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../scripts/seed-core';

const PLATFORM_CONFIG_TARGET_ID = '00000000-0000-7000-8000-000000000000';

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

test.describe('US-ADMIN-07 everything I do is on the record', () => {
	test('TC-ADMIN-07a: admin actions appear in the audit viewer with full fields', async ({
		page,
		request
	}) => {
		await signInAdmin(request);

		const unpublish = await request.post('/admin/api/trust/moderation/unpublish', {
			data: {
				providerProfileId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'Live-stack audit trail verification.'
			}
		});
		expect(unpublish.ok(), await unpublish.text()).toBeTruthy();

		const apiAudit = await request.get(
			`/admin/api/audit?targetType=provider_profile&targetId=${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(apiAudit.ok(), await apiAudit.text()).toBeTruthy();
		const apiBody = (await apiAudit.json()) as {
			data: Array<{
				action: string;
				actorDisplayName: string;
				reason: string | null;
				targetType: string;
				targetId: string;
				occurredAt: string;
			}>;
		};
		const entry = apiBody.data.find((row) => row.action === 'moderation.unpublish');
		expect(entry).toBeDefined();
		expect(entry!.actorDisplayName).toBeTruthy();
		expect(entry!.reason).toBe('Live-stack audit trail verification.');
		expect(entry!.targetType).toBe('provider_profile');
		expect(entry!.targetId).toBe(SEED_CORE_PRIMARY_PROFILE_ID);
		expect(entry!.occurredAt).toBeTruthy();

		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto(
			`/admin/audit?targetType=provider_profile&targetId=${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		await expect(page.getByTestId('admin-audit-log')).toBeVisible();
		const row = page
			.getByTestId('audit-log-entry')
			.filter({ hasText: 'moderation.unpublish' })
			.first();
		await expect(row).toBeVisible();
		await expect(row.getByTestId('audit-actor')).not.toBeEmpty();
		await expect(row.getByTestId('audit-reason')).toContainText(
			'Live-stack audit trail verification.'
		);
	});

	test('TC-ADMIN-07b: no API path can modify audit entries', async ({ request }) => {
		await signInAdmin(request);

		const list = await request.get(
			`/admin/api/audit?targetType=provider_profile&targetId=${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(list.ok()).toBeTruthy();
		const body = (await list.json()) as { data: Array<{ id: string }> };
		const entryId = body.data[0]?.id;
		expect(entryId).toBeTruthy();

		const patch = await request.patch(`/admin/api/audit?id=${entryId}`, {
			data: { reason: 'tampered' }
		});
		expect(patch.status()).toBe(405);

		const del = await request.delete(`/admin/api/audit?id=${entryId}`);
		expect(del.status()).toBe(405);
	});

	test('invalid audit cursor returns validation error', async ({ request }) => {
		await signInAdmin(request);

		const response = await request.get(
			`/admin/api/audit?targetType=provider_profile&targetId=${SEED_CORE_PRIMARY_PROFILE_ID}&cursor=not-a-valid-cursor`
		);
		expect(response.status()).toBe(422);
	});

	test('load older entries keeps the first page visible', async ({ page, request }) => {
		await signInAdmin(request);

		for (const days of [17, 19]) {
			const update = await request.put('/admin/api/platform/config/listing-billing.trial_period_days', {
				data: { value: days }
			});
			expect(update.ok(), await update.text()).toBeTruthy();
		}

		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);
		await page.goto(
			`/admin/audit?targetType=platform_config&targetId=${PLATFORM_CONFIG_TARGET_ID}&limit=1`
		);

		const firstEntry = page.getByTestId('audit-log-entry').first();
		const firstEntryId = await firstEntry.getAttribute('data-audit-id');
		expect(firstEntryId).toBeTruthy();
		await expect(page.getByTestId('audit-log-entry')).toHaveCount(1);

		await page.getByTestId('audit-log-load-more').click();
		await expect(page.getByTestId('audit-log-entry')).toHaveCount(2);
		await expect(page.locator(`[data-audit-id="${firstEntryId}"]`)).toBeVisible();
	});

	test('audit log page has no critical or serious axe violations', async ({ page, request }) => {
		await signInAdmin(request);
		const storage = await request.storageState();
		await page.context().addCookies(storage.cookies);

		await page.goto(
			`/admin/audit?targetType=provider_profile&targetId=${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
			.analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
