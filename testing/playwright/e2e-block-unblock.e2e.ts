import { expect, test, type BrowserContextOptions } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';
import {
	SEED_SAFE02_AMARA_EMAIL,
	SEED_SAFE02_AMARA_PASSWORD,
	SEED_SAFE02_REVIEW_BODY,
	SEED_SAFE02_REVIEW_ID,
	SEED_SAFE02_SEEKER_EMAIL,
	SEED_SAFE02_SEEKER_PASSWORD
} from '../../scripts/seed-blocking-constants';

const AMARA_OWNER_ID = '01900000-0000-7000-8000-000000000001';
const DUAL_AMARA_THREAD_ID = '01900000-0000-7000-8000-000000000881';

function isProfilePage(url: string): boolean {
	return new URL(url).pathname === '/profile';
}

async function expectProfilePage(
	page: import('@playwright/test').Page,
	timeout = 15_000
): Promise<void> {
	await expect(page).toHaveURL(isProfilePage, { timeout });
}

async function signIn(
	page: import('@playwright/test').Page,
	email: string,
	password: string,
	returnTo = '/profile'
): Promise<void> {
	await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent(returnTo)}`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expectProfilePage(page);
}

async function searchProviderIds(page: import('@playwright/test').Page): Promise<string[]> {
	const res = await page.request.get('/api/discovery/search');
	expect(res.ok()).toBeTruthy();
	const body = (await res.json()) as { data: Array<{ providerProfileId: string }> };
	return body.data.map((card) => card.providerProfileId);
}

test.describe.configure({ mode: 'serial' });

test.describe('US-SAFE-02 block instant silent messages both ways', () => {
	let dualRoleStorage: BrowserContextOptions['storageState'];
	let amaraStorage: BrowserContextOptions['storageState'];

	test.beforeAll(async ({ browser }) => {
		const dualContext = await browser.newContext();
		const dualPage = await dualContext.newPage();
		await signIn(dualPage, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD);
		dualRoleStorage = await dualContext.storageState();
		await dualContext.close();

		const amaraContext = await browser.newContext();
		const amaraPage = await amaraContext.newPage();
		await signIn(amaraPage, SEED_SAFE02_AMARA_EMAIL, SEED_SAFE02_AMARA_PASSWORD);
		amaraStorage = await amaraContext.storageState();
		await amaraContext.close();
	});

	test('TC-SAFE-02a: block stops messaging both ways immediately', async ({ browser }) => {
		test.setTimeout(60_000);
		const context = await browser.newContext({ storageState: dualRoleStorage });
		const page = await context.newPage();

		const blockRes = await page.request.post('/api/trust/blocks', {
			data: { blockedId: AMARA_OWNER_ID }
		});
		expect(blockRes.ok()).toBeTruthy();

		const seekerSend = await page.request.post(
			`/api/messaging/threads/${DUAL_AMARA_THREAD_ID}/messages`,
			{ data: { body: 'Seeker attempt after block' } }
		);
		expect(seekerSend.status()).toBe(404);

		const amaraContext = await browser.newContext({ storageState: amaraStorage });
		const amaraPage = await amaraContext.newPage();
		const providerSend = await amaraPage.request.post(
			`/api/messaging/threads/${DUAL_AMARA_THREAD_ID}/messages`,
			{ data: { body: 'Provider attempt after block' } }
		);
		expect(providerSend.status()).toBe(404);

		await amaraContext.close();
		await context.close();
	});

	test('TC-SAFE-02b: asymmetric discovery hide — blocker hidden from blocked party only', async ({
		browser
	}) => {
		const dualContext = await browser.newContext({ storageState: dualRoleStorage });
		const dualPage = await dualContext.newPage();
		const dualResults = await searchProviderIds(dualPage);
		expect(dualResults).toContain(SEED_CORE_PRIMARY_PROFILE_ID);

		const amaraContext = await browser.newContext({ storageState: amaraStorage });
		const amaraPage = await amaraContext.newPage();
		const amaraResults = await searchProviderIds(amaraPage);
		expect(amaraResults).not.toContain(SEED_DUAL_ROLE_PROFILE_ID);

		await amaraContext.close();
		await dualContext.close();
	});

	test('TC-SAFE-02c: blocked party receives no block notification', async ({ browser }) => {
		const amaraContext = await browser.newContext({ storageState: amaraStorage });
		const amaraPage = await amaraContext.newPage();

		const notifRes = await amaraPage.request.get('/api/notifications/in-app');
		expect(notifRes.ok()).toBeTruthy();
		const notifBody = (await notifRes.json()) as {
			data: Array<{ category: string; title: string }>;
		};
		expect(
			notifBody.data.some((entry) => entry.category.includes('block') || /block/i.test(entry.title))
		).toBe(false);

		await amaraContext.close();
	});

	test('TC-SAFE-02d: unblock via profile settings restores messaging', async ({ browser }) => {
		test.setTimeout(90_000);
		const context = await browser.newContext({ storageState: dualRoleStorage });
		const page = await context.newPage();

		const listRes = await page.request.get('/api/trust/blocks');
		expect(listRes.ok()).toBeTruthy();
		const listBody = (await listRes.json()) as {
			data: Array<{ blockedId: string; displayName: string }>;
		};
		expect(listBody.data.some((entry) => entry.blockedId === AMARA_OWNER_ID)).toBeTruthy();

		await page.goto('/profile');
		await expect(page.getByRole('heading', { name: 'Blocked people' })).toBeVisible();
		await expect(page.getByTestId('blocked-people-list')).toBeVisible();
		const axeResults = await new AxeBuilder({ page })
			.include('[data-testid="blocked-people-list"]')
			.analyze();
		expect(
			axeResults.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toEqual([]);
		await expect(page.getByText('Amara T.')).toBeVisible();
		await page
			.getByTestId(`unblock-${AMARA_OWNER_ID}`)
			.getByRole('button', { name: 'Unblock' })
			.click();
		await expect(page.getByTestId('blocked-people-empty')).toBeVisible({ timeout: 15_000 });

		const restored = await page.request.post(
			`/api/messaging/threads/${DUAL_AMARA_THREAD_ID}/messages`,
			{ data: { body: 'Messaging restored after unblock' } }
		);
		expect(restored.ok()).toBeTruthy();

		const amaraContext = await browser.newContext({ storageState: amaraStorage });
		const amaraPage = await amaraContext.newPage();
		const amaraResults = await searchProviderIds(amaraPage);
		expect(amaraResults).toContain(SEED_DUAL_ROLE_PROFILE_ID);

		await amaraContext.close();
		await context.close();
	});
});

test.describe('US-REV-06 blocking does not rewrite history', () => {
	const SAFE02_THREAD_ID = '01900000-0000-7000-8000-00000000c311';

	test('TC-REV-06a: existing reviews survive a block in both directions', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const profilePath = `/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`;
		await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent(profilePath)}`);
		await page.getByLabel('Email').fill(SEED_SAFE02_SEEKER_EMAIL);
		await page.getByLabel('Password').fill(SEED_SAFE02_SEEKER_PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(new RegExp(profilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
			timeout: 15_000
		});

		await expect(page.getByTestId('profile-reviews')).toBeVisible();
		await expect(
			page.getByTestId('profile-review-item').filter({ hasText: SEED_SAFE02_REVIEW_BODY })
		).toBeVisible();

		const beforeRes = await page.request.get(
			`/api/reviews/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(beforeRes.ok()).toBeTruthy();
		const beforeBody = (await beforeRes.json()) as { data: Array<{ id: string; body: string }> };
		const beforeReview = beforeBody.data.find((review) => review.id === SEED_SAFE02_REVIEW_ID);
		expect(beforeReview?.body).toBe(SEED_SAFE02_REVIEW_BODY);

		const blockRes = await page.request.post('/api/trust/blocks', {
			data: { blockedId: AMARA_OWNER_ID }
		});
		expect(blockRes.ok()).toBeTruthy();

		const messageRes = await page.request.post(
			`/api/messaging/threads/${SAFE02_THREAD_ID}/messages`,
			{ data: { body: 'Blocked seeker attempt' } }
		);
		expect(messageRes.status()).toBe(404);

		const afterRes = await page.request.get(
			`/api/reviews/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`
		);
		expect(afterRes.ok()).toBeTruthy();
		const afterBody = (await afterRes.json()) as { data: Array<{ id: string; body: string }> };
		const afterReview = afterBody.data.find((review) => review.id === SEED_SAFE02_REVIEW_ID);
		expect(afterReview?.body).toBe(SEED_SAFE02_REVIEW_BODY);

		await page.reload();
		await expect(
			page.getByTestId('profile-review-item').filter({ hasText: SEED_SAFE02_REVIEW_BODY })
		).toBeVisible();

		const amaraContext = await browser.newContext();
		const amaraPage = await amaraContext.newPage();
		await amaraPage.goto('/sign-in?flow=sign-in&returnTo=%2Fprovider%2Freviews');
		await amaraPage.getByLabel('Email').fill(SEED_SAFE02_AMARA_EMAIL);
		await amaraPage.getByLabel('Password').fill(SEED_SAFE02_AMARA_PASSWORD);
		await amaraPage.getByRole('button', { name: 'Sign in' }).click();
		await expect(amaraPage).toHaveURL(/\/provider\/reviews/, { timeout: 15_000 });
		await expect(
			amaraPage.getByTestId('provider-review-item').filter({ hasText: SEED_SAFE02_REVIEW_BODY })
		).toBeVisible();

		const axe = await new AxeBuilder({ page }).include('[data-testid="profile-reviews"]').analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);

		await amaraContext.close();
		await context.close();
	});
});
