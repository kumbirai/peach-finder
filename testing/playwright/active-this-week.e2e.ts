import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const THANDI_PROFILE_ID = '01900000-0000-7000-8000-000000000102';

test.describe('US-AVAIL-04 active this week earned automatically', () => {
	test('TC-AVAIL-04a: badge granted from recent availability via daily computation', async ({
		page,
		request
	}) => {
		await page.goto(`/provider/${THANDI_PROFILE_ID}`);

		const tickRes = await request.post('/api/dev/active-this-week-tick', {
			data: { now: '2026-09-05T12:00:00.000Z' }
		});
		expect(tickRes.ok(), await tickRes.text()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { granted: string[]; evaluated: number };
		};
		expect(tickBody.data.evaluated).toBeGreaterThan(0);

		await page.reload();
		await expect(page.getByTestId('trust-badge-active-week')).toBeVisible();

		const accessibility = await new AxeBuilder({ page })
			.include('[data-testid="profile-trust-badges"]')
			.analyze();
		const serious = accessibility.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});

	test('TC-AVAIL-04b: no manual grant path exists for the badge', async ({ request }) => {
		const manualGrant = await request.post('/api/dev/grant-active-this-week', {
			data: { providerProfileId: THANDI_PROFILE_ID }
		});
		expect(manualGrant.status()).toBe(404);

		const adminGrant = await request.post(
			`/admin/api/providers/${THANDI_PROFILE_ID}/badge/active-this-week`,
			{ data: { granted: true } }
		);
		expect([401, 403, 404]).toContain(adminGrant.status());
	});
});
