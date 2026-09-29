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
		name: 'Avail E2E',
		email: `e2e-avail-${stamp}@example.com`,
		phone: `082${String(stamp).slice(-7)}`,
		password: 'password123'
	};
	await registerProviderViaSession(page, page.request, input);
	const meRes = await page.request.get('/api/provider/me/profile');
	expect(meRes.ok()).toBeTruthy();
	const meBody = (await meRes.json()) as { data: { profileId: string } };
	return { profileId: meBody.data.profileId, displayName: input.name };
}

test.describe('US-AVAIL-01 one tap available', () => {
	test('TC-AVAIL-01a: single-tap set from dashboard and profile preview', async ({
		page,
		browser
	}) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const toggle = page.getByTestId('availability-toggle');
		await expect(toggle).toHaveAttribute('aria-checked', 'false');

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();
		await page.reload();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		const statusRes = await page.request.get('/api/availability/status/me');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: { availability: { state: string; setAt: string | null } };
		};
		expect(statusBody.data.availability.state).toBe('available');
		expect(statusBody.data.availability.setAt).toBeTruthy();

		await page.goto('/provider/profile/preview');
		const previewToggle = page.getByTestId('availability-toggle');
		await expect(previewToggle).toHaveAttribute('aria-checked', 'true');

		await assertPrimaryListingLive(page.request);
		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await expect
			.poll(async () => {
				const search = await anonPage.request.get(
					`/api/discovery/search?q=${encodeURIComponent(displayName)}&available=1`
				);
				if (!search.ok()) return false;
				const body = (await search.json()) as { data: Array<{ providerProfileId: string }> };
				return body.data.some((card) => card.providerProfileId === profileId);
			})
			.toBe(true);
		await anonPage.goto(`/?q=${encodeURIComponent(displayName)}&available=1`);
		await expect(homepageProviderCard(anonPage, profileId).getByText(/Available now/)).toBeVisible({
			timeout: 15_000
		});
		await anonContext.close();
	});

	test('TC-AVAIL-01c: re-tap refreshes availability ordering', async ({ page, browser }) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);
		const toggle = page.getByTestId('availability-toggle');

		const firstPost = await page.request.post('/api/availability/status');
		expect(firstPost.ok(), await firstPost.text()).toBeTruthy();

		const firstSet = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string } };
			}
		).data.availability.setAt;

		await page.waitForTimeout(1_100);

		const renewPost = await page.request.post('/api/availability/status');
		expect(renewPost.ok(), await renewPost.text()).toBeTruthy();
		const secondSet = (
			(await (await page.request.get('/api/availability/status/me')).json()) as {
				data: { availability: { setAt: string } };
			}
		).data.availability.setAt;
		expect(new Date(secondSet).getTime()).toBeGreaterThan(new Date(firstSet).getTime());

		await page.reload();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await expect
			.poll(async () => {
				const search = await anonPage.request.get('/api/discovery/search?available=1');
				if (!search.ok()) return null;
				const body = (await search.json()) as { data: Array<{ providerProfileId: string }> };
				return body.data[0]?.providerProfileId ?? null;
			})
			.toBe(profileId);
		await anonPage.goto('/?available=1');
		const firstCardLink = anonPage.locator('a[href^="/provider/"]').first();
		await expect(firstCardLink).toBeVisible({ timeout: 15_000 });
		await expect(firstCardLink).toHaveAttribute('href', `/provider/${profileId}`);
		await expect(anonPage.getByText(displayName).first()).toBeVisible();
		await anonContext.close();
	});
});

test.describe('US-AVAIL-02 one tap im done', () => {
	test('TC-AVAIL-02a: single-tap clear removes provider from available-now surfaces', async ({
		page,
		browser
	}) => {
		const { profileId, displayName } = await registerAndPublishProvider(page);

		const setRes = await page.request.post('/api/availability/status');
		expect(setRes.ok(), await setRes.text()).toBeTruthy();
		await page.reload();
		await page.waitForLoadState('networkidle');

		const toggle = page.getByRole('switch', { name: "You're available now" });
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();
		await expect
			.poll(async () => {
				const search = await anonPage.request.get(
					`/api/discovery/search?q=${encodeURIComponent(displayName)}&available=1`
				);
				if (!search.ok()) return false;
				const body = (await search.json()) as { data: Array<{ providerProfileId: string }> };
				return body.data.some((card) => card.providerProfileId === profileId);
			})
			.toBe(true);
		await anonPage.goto(`/?q=${encodeURIComponent(displayName)}&available=1`);
		await expect(homepageProviderCard(anonPage, profileId).getByText(/Available now/)).toBeVisible({
			timeout: 15_000
		});
		await anonContext.close();

		const [clearResponse] = await Promise.all([
			page.waitForResponse(
				(response) =>
					response.url().includes('/provider/dashboard') && response.request().method() === 'POST'
			),
			page.getByTestId('availability-toggle').click()
		]);
		expect(clearResponse.ok(), await clearResponse.text()).toBeTruthy();

		const clearedToggle = page.getByTestId('availability-toggle');
		await expect(clearedToggle).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByRole('heading', { name: "You're away" })).toBeVisible();

		const statusRes = await page.request.get('/api/availability/status/me');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as {
			data: { availability: { state: string } };
		};
		expect(statusBody.data.availability.state).toBe('not_available');

		const anonAfter = await browser.newContext();
		const anonAfterPage = await anonAfter.newPage();
		await anonAfterPage.goto(`/?q=${encodeURIComponent(displayName)}`);
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
