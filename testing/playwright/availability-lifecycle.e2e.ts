import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { assertPrimaryListingLive } from './live-backend-assert';
import { registerAndPublishProvider as registerProviderViaSession } from './provider-session';

function homepageProviderCard(page: import('@playwright/test').Page, profileId: string) {
	return page.locator('article').filter({
		has: page.locator(`a[href="/provider/${profileId}"]`)
	});
}

async function registerAndPublishProvider(page: import('@playwright/test').Page) {
	const stamp = Date.now();
	const input = {
		name: 'Lifecycle E2E',
		email: `e2e-lifecycle-${stamp}@example.com`,
		phone: `083${String(stamp).slice(-7)}`,
		password: 'password123'
	};
	await registerProviderViaSession(page, page.request, input);
	const meRes = await page.request.get('/api/provider/me/profile');
	expect(meRes.ok()).toBeTruthy();
	const meBody = (await meRes.json()) as { data: { profileId: string } };
	return { profileId: meBody.data.profileId, displayName: input.name };
}

test.describe('US-AVAIL-03 availability lifecycle', () => {
	test('TC-AVAIL-03b: warning notification and still-available renewal', async ({ page }) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const statusRes = await page.request.get('/api/availability/status/me');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: { availability: { expiresAt: string } };
		};
		const expiresAt = new Date(statusBody.data.availability.expiresAt);
		const warnAt = new Date(expiresAt.getTime() - 15 * 60_000);

		const warnTick = await page.request.post('/api/dev/availability-tick', {
			data: { now: warnAt.toISOString() }
		});
		expect(warnTick.ok(), await warnTick.text()).toBeTruthy();

		await page.goto('/provider/dashboard');
		await expect(page.getByTestId('availability-renewal-banner')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('still-available-button')).toBeVisible();

		const beforeRenew = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string } };
			}
		).data.availability.setAt;

		await page.getByTestId('still-available-button').click();
		await expect(page.getByTestId('availability-renewal-banner')).toHaveCount(0, {
			timeout: 15_000
		});

		const afterRenew = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string; state: string } };
			}
		).data.availability;
		expect(afterRenew.state).toBe('available');
		expect(new Date(afterRenew.setAt).getTime()).toBeGreaterThan(new Date(beforeRenew).getTime());

		await assertPrimaryListingLive(page.request);
		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);

		void profileId;
		void displayName;
	});

	test('TC-AVAIL-03a/03c: auto-expire clears availability without negative marker', async ({
		page,
		browser
	}) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();

		const statusBody = (await (await page.request.get('/api/availability/status/me')).json()) as {
			data: { availability: { expiresAt: string } };
		};
		const expiresAt = new Date(statusBody.data.availability.expiresAt);
		const warnAt = new Date(expiresAt.getTime() - 15 * 60_000);
		const sweepAt = new Date(expiresAt.getTime() + 1_000);

		const warnTick = await page.request.post('/api/dev/availability-tick', {
			data: { now: warnAt.toISOString() }
		});
		expect(warnTick.ok(), await warnTick.text()).toBeTruthy();

		const anonBefore = await browser.newContext();
		const anonBeforePage = await anonBefore.newPage();
		await anonBeforePage.goto('/');
		await expect(anonBeforePage.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
		await expect(homepageProviderCard(anonBeforePage, profileId).getByText(/Available now/)).toBeVisible({
			timeout: 15_000
		});
		await anonBefore.close();

		const sweepTick = await page.request.post('/api/dev/availability-tick', {
			data: { now: sweepAt.toISOString() }
		});
		expect(sweepTick.ok(), await sweepTick.text()).toBeTruthy();
		const sweepBody = (await sweepTick.json()) as { data: { expired: number } };
		expect(sweepBody.data.expired).toBeGreaterThanOrEqual(1);

		const clearedStatus = (await (
			await page.request.get('/api/availability/status/me')
		).json()) as { data: { availability: { state: string } } };
		expect(clearedStatus.data.availability.state).toBe('not_available');

		await page.goto('/provider/dashboard');
		await expect(page.getByTestId('availability-renewal-banner')).toHaveCount(0);
		await expect(page.getByTestId('availability-toggle')).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByText('expired', { exact: false })).toHaveCount(0);
		await expect(page.getByText('warning badge', { exact: false })).toHaveCount(0);

		const anonAfter = await browser.newContext();
		const anonAfterPage = await anonAfter.newPage();
		await anonAfterPage.goto('/');
		await expect(anonAfterPage.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
		await expect(homepageProviderCard(anonAfterPage, profileId).getByText(/Available now/)).toHaveCount(0);
		await anonAfter.close();

		await assertPrimaryListingLive(page.request);
		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});
