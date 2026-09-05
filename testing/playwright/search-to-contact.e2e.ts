import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_PHONE_OFF_DISPLAY_NAME,
	SEED_CORE_PHONE_OFF_NUMBER,
	SEED_CORE_PHONE_OFF_PROFILE_ID,
	SEED_CORE_PHONE_ON_NUMBER,
	SEED_CORE_PRIMARY_PROFILE_ID
} from '../../scripts/seed-core';

const DRAFT = 'Hi, are you available this afternoon?';

test.describe('E2E-1 search to contact', () => {
	test('TC-PRIV-01a: anonymous responses omit phone when visibility is OFF', async ({
		browser
	}) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		const apiRes = await anonPage.request.get(
			`/api/provider/profile/${SEED_CORE_PHONE_OFF_PROFILE_ID}`
		);
		expect(apiRes.ok()).toBeTruthy();
		const apiBody = (await apiRes.json()) as { data: Record<string, unknown> };
		expect('phone' in apiBody.data).toBe(false);
		expect(JSON.stringify(apiBody)).not.toContain(SEED_CORE_PHONE_OFF_NUMBER);

		const htmlRes = await anonPage.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		expect(htmlRes?.ok()).toBeTruthy();
		const html = await htmlRes!.text();
		expect(html).not.toContain(SEED_CORE_PHONE_OFF_NUMBER);
		expect(html).not.toMatch(/tel:\+27/);
		await expect(anonPage.getByRole('link', { name: 'Call' })).toHaveCount(0);

		const searchRes = await anonPage.request.get('/api/discovery/search');
		expect(searchRes.ok()).toBeTruthy();
		const searchBody = await searchRes.json();
		expect(JSON.stringify(searchBody)).not.toContain(SEED_CORE_PHONE_OFF_NUMBER);
		expect(JSON.stringify(searchBody)).not.toContain('"phone"');

		const homepageRes = await anonPage.goto('/');
		expect(homepageRes?.ok()).toBeTruthy();
		const homepageHtml = await homepageRes!.text();
		expect(homepageHtml).not.toContain(SEED_CORE_PHONE_OFF_NUMBER);
		await expect(anonPage.getByText(SEED_CORE_PHONE_OFF_DISPLAY_NAME)).toBeVisible();

		const phoneOnApi = await anonPage.request.get(
			`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		const phoneOnBody = (await phoneOnApi.json()) as { data: { phone?: string } };
		expect(phoneOnBody.data.phone).toBe(SEED_CORE_PHONE_ON_NUMBER);

		await anonContext.close();
	});

	test('anonymous phone visibility respects seeded provider settings on profile pages', async ({
		browser
	}) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		await anonPage.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		await expect(
			anonPage.getByRole('heading', { level: 1, name: SEED_CORE_PHONE_OFF_DISPLAY_NAME })
		).toBeVisible();
		await expect(anonPage.getByRole('link', { name: 'Call' })).toHaveCount(0);

		await anonPage.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await expect(anonPage.getByRole('link', { name: 'Call' })).toBeVisible();
		await expect(anonPage.locator('a[href^="tel:+27"]')).toHaveCount(2);

		await anonContext.close();
	});

	test('TC-VIEW-01a: full profile field set renders on seeded provider', async ({ browser }) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		await anonPage.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await expect(anonPage.getByRole('heading', { level: 1, name: 'Amara T.' })).toBeVisible();
		await expect(anonPage.getByTestId('profile-intro')).toBeVisible();
		await expect(anonPage.getByTestId('profile-services')).toBeVisible();
		await expect(anonPage.getByTestId('profile-tags')).toBeVisible();
		await expect(anonPage.getByTestId('profile-languages')).toBeVisible();
		await expect(anonPage.getByTestId('profile-reviews')).toBeVisible();
		await expect(anonPage.getByTestId('profile-response-time')).toBeVisible();
		await expect(anonPage.getByTestId('profile-online-status')).toBeVisible();
		await expect(anonPage.getByRole('group', { name: 'Contact actions' })).toBeVisible();
		await expect(
			anonPage
				.getByRole('group', { name: 'Contact actions' })
				.getByRole('link', { name: /^Message / })
		).toBeVisible();

		await anonContext.close();
	});

	test('TC-VIEW-01b: trust signals are above the fold at 360px', async ({ browser }) => {
		const anonContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
		const anonPage = await anonContext.newPage();

		await anonPage.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const badges = anonPage.getByTestId('profile-trust-badges');
		const rating = anonPage.getByTestId('profile-rating');
		await expect(badges).toBeVisible();
		await expect(rating).toBeVisible();

		const badgesBox = await badges.boundingBox();
		const ratingBox = await rating.boundingBox();
		expect(badgesBox).toBeTruthy();
		expect(ratingBox).toBeTruthy();
		expect(badgesBox!.y).toBeLessThan(800);
		expect(ratingBox!.y).toBeLessThan(800);

		await anonContext.close();
	});

	test('TC-VIEW-01c: anonymous cold load is server-rendered with link-preview metadata', async ({
		browser
	}) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		const response = await anonPage.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(response?.ok()).toBeTruthy();
		const html = await response!.text();
		expect(html).toContain('Amara T.');
		expect(html).toContain('Deep tissue specialist');
		expect(html).toMatch(/property="og:title"/);
		expect(html).toMatch(/content="Amara T\."/);
		expect(html).toMatch(/property="og:description"/);
		expect(html).toMatch(/property="og:image"/);
		await expect(anonPage.getByTestId('profile-name')).toBeVisible();

		await anonContext.close();
	});

	test('TC-VIEW-06a: copy-link control exposes the canonical profile URL', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const shareHost = page.getByTestId('profile-share-button');
		await expect(shareHost).toHaveAttribute(
			'data-share-url',
			new RegExp(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`)
		);
		const shareButton = shareHost.getByRole('button', { name: 'Copy profile link' });
		await expect(shareButton).toBeVisible();
		await shareButton.click();
		expect(pageErrors).toEqual([]);

		await context.close();
	});

	test('TC-VIEW-06a: share sheet path is covered by unit tests; profile exposes share control', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await expect(page.getByRole('group', { name: 'Profile actions' })).toContainText(
			'Copy profile link'
		);

		await context.close();
	});

	test('TC-VIEW-06b: shared link opens with correct preview metadata in a fresh session', async ({
		browser
	}) => {
		const freshContext = await browser.newContext();
		const freshPage = await freshContext.newPage();
		const response = await freshPage.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		expect(response?.ok()).toBeTruthy();
		const html = await response!.text();
		expect(html).toContain('Amara T.');
		expect(html).toMatch(/property="og:title"/);
		expect(html).toMatch(/content="Amara T\."/);
		expect(html).toMatch(/property="og:image"/);
		await expect(freshPage.getByRole('heading', { level: 1, name: 'Amara T.' })).toBeVisible();

		await freshContext.close();
	});

	test('TC-VIEW-02a: inactive provider presence is coarse and never an exact timestamp', async ({
		browser
	}) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		const apiRes = await anonPage.request.get(
			`/api/provider/profile/${SEED_CORE_PHONE_OFF_PROFILE_ID}`
		);
		expect(apiRes.ok()).toBeTruthy();
		const apiBody = (await apiRes.json()) as {
			data: { onlineStatus?: string; lastSeen?: string; lastActive?: string };
		};
		expect(['today', 'this_week', 'a_while_ago']).toContain(apiBody.data.onlineStatus);
		expect(apiBody.data.onlineStatus).not.toBe('online');
		expect(apiBody.data.lastSeen).toBeUndefined();
		expect(apiBody.data.lastActive).toBeUndefined();
		expect(JSON.stringify(apiBody)).not.toMatch(/"onlineStatus"\s*:\s*"\d{4}-\d{2}-\d{2}/);

		await anonPage.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		const onlineStatus = anonPage.getByTestId('profile-online-status');
		await expect(onlineStatus).toBeVisible();
		await expect(onlineStatus).toContainText(/Active today|Active this week|Active a while ago/);
		await expect(onlineStatus).not.toContainText(/Online now/);
		await expect(onlineStatus).not.toContainText(/\d{1,2}:\d{2}/);

		await anonContext.close();
	});

	test('TC-VIEW-02b: sparse reply history renders no response-time claim', async ({ browser }) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		const apiRes = await anonPage.request.get(
			`/api/provider/profile/${SEED_CORE_PHONE_OFF_PROFILE_ID}`
		);
		const apiBody = (await apiRes.json()) as { data: { responseTime?: string | null } };
		expect(apiBody.data.responseTime ?? null).toBeNull();

		await anonPage.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		await expect(anonPage.getByTestId('profile-response-time')).toHaveCount(0);

		await anonContext.close();
	});

	test('TC-VIEW-03a: message stays sticky and primary while scrolling on mobile', async ({
		browser
	}) => {
		const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const stickyCta = page.getByTestId('profile-sticky-cta');
		const message = stickyCta.getByRole('link', { name: /^Message / });
		await expect(message).toBeVisible();
		await expect(message).toHaveClass(/btn-primary/);

		const beforeScroll = await message.boundingBox();
		expect(beforeScroll).toBeTruthy();

		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const afterScroll = await message.boundingBox();
		expect(afterScroll).toBeTruthy();
		expect(afterScroll!.y + afterScroll!.height).toBeLessThanOrEqual(640);
		expect(afterScroll!.y).toBeGreaterThan(400);

		await context.close();
	});

	test('TC-VIEW-03b: call visibility follows phone setting and auth state', async ({ browser }) => {
		const anonContext = await browser.newContext();
		const anonPage = await anonContext.newPage();

		await anonPage.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		await expect(anonPage.getByRole('link', { name: 'Call' })).toHaveCount(0);
		await expect(anonPage.locator('a[href^="tel:"]')).toHaveCount(0);
		const anonHtml = await anonPage.content();
		expect(anonHtml).not.toContain(SEED_CORE_PHONE_OFF_NUMBER);

		const seekerContext = await browser.newContext();
		const seekerPage = await seekerContext.newPage();
		const email = `view03-seeker-${Date.now()}@example.com`;
		await seekerPage.goto('/sign-in?returnTo=/profile');
		await seekerPage.getByLabel('Your name').fill('View03 Seeker');
		await seekerPage.getByLabel('Email').fill(email);
		await seekerPage.getByLabel('Password').fill('password123');
		await seekerPage.locator('input[name="acceptedTerms"]').check();
		await seekerPage.getByRole('button', { name: 'Create account' }).click();
		await expect(seekerPage).toHaveURL(/\/profile/);

		await seekerPage.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		await expect(seekerPage.getByRole('link', { name: 'Call' })).toBeVisible();
		await expect(seekerPage.locator('a[href^="tel:+27"]')).toHaveCount(2);

		await anonContext.close();
		await seekerContext.close();
	});

	test('TC-VIEW-03c: signed-in seeker message preserves session draft on direct compose link', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const email = `view03-draft-${Date.now()}@example.com`;
		const draft = 'Still interested — are you free Saturday?';

		await page.goto('/sign-in?returnTo=/profile');
		await page.getByLabel('Your name').fill('View03 Draft Seeker');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		const message = page
			.getByRole('group', { name: 'Contact actions' })
			.getByRole('link', { name: /^Message / });
		await expect(message).toHaveAttribute(
			'href',
			new RegExp(`/messages/compose/${SEED_CORE_PRIMARY_PROFILE_ID}`)
		);

		await page.evaluate(({ id, text }) => sessionStorage.setItem(`pf_message_draft_${id}`, text), {
			id: SEED_CORE_PRIMARY_PROFILE_ID,
			text: draft
		});

		await message.click();
		await expect(page).toHaveURL(
			new RegExp(`/messages/compose/${SEED_CORE_PRIMARY_PROFILE_ID}\\?draft=`),
			{ timeout: 15_000 }
		);
		await expect(page.getByLabel('Your message')).toHaveValue(draft, { timeout: 10_000 });

		await context.close();
	});

	test('golden path: homepage to profile to sign-up preserves message context', async ({
		page
	}) => {
		const email = `e2e-stc-${Date.now()}@example.com`;

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 2, name: /\d+ available now/i })).toBeVisible();

		const card = page.locator(`a[href="/provider/${SEED_CORE_PRIMARY_PROFILE_ID}"]`).first();
		await expect(card).toBeVisible();
		await card.click();
		await expect(page).toHaveURL(new RegExp(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`));
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Call' })).toBeVisible();

		await page.evaluate(
			({ id, draft }) => sessionStorage.setItem(`pf_message_draft_${id}`, draft),
			{ id: SEED_CORE_PRIMARY_PROFILE_ID, draft: DRAFT }
		);
		await page.reload();

		await page
			.getByRole('group', { name: 'Contact actions' })
			.getByRole('link', { name: /^Message / })
			.click();
		await expect(page).toHaveURL(/\/sign-in\?/);
		await expect(page).toHaveURL(/draft=/);

		await page.getByLabel('Your name').fill('Search Contact E2E');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('password123');
		await page.locator('input[name="acceptedTerms"]').check();
		await page.getByRole('button', { name: 'Create account' }).click();

		await expect(page).toHaveURL(
			new RegExp(`/messages/compose/${SEED_CORE_PRIMARY_PROFILE_ID}\\?draft=`)
		);
		await expect(page.getByLabel('Your message')).toHaveValue(DRAFT, { timeout: 10_000 });
	});

	test('profile page has no critical or serious axe violations', async ({ page }) => {
		await page.goto(`/provider/${SEED_CORE_PHONE_OFF_PROFILE_ID}`);
		const results = await new AxeBuilder({ page }).analyze();
		const serious = results.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(serious).toEqual([]);
	});
});
