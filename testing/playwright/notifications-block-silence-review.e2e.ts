import { expect, test } from '@playwright/test';
import { assertPrimaryListingLive } from './live-backend-assert';

const SEED_REV_PROVIDER_PROFILE_ID = '01900000-0000-7000-8000-000000000103';
const SEED_REV_PROVIDER_EMAIL = 'rev-provider@example.com';
const SEED_REV_PROVIDER_PASSWORD = 'password123';
const SEED_REV_ELIGIBLE_SEEKER_ID = '01900000-0000-7000-8000-00000000d102';
const SEED_REV_ELIGIBLE_SEEKER_EMAIL = 'rev-eligible@example.com';
const SEED_REV_ELIGIBLE_SEEKER_PASSWORD = 'password123';

async function signIn(
	page: import('@playwright/test').Page,
	email: string,
	password: string,
	returnTo: string
) {
	await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent(returnTo)}`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(new RegExp(returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
		timeout: 15_000
	});
}

test.describe('block-silence for actor-attributed reviews', () => {
	test('blocked reviewer does not create review_received after dispatch', async ({
		browser,
		request
	}) => {
		const reseed = await request.post('/api/dev/reseed-reviews');
		expect(reseed.ok()).toBeTruthy();
		await assertPrimaryListingLive(request);

		const seekerCtx = await browser.newContext();
		const seekerPage = await seekerCtx.newPage();
		await signIn(
			seekerPage,
			SEED_REV_ELIGIBLE_SEEKER_EMAIL,
			SEED_REV_ELIGIBLE_SEEKER_PASSWORD,
			`/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`
		);
		await expect(seekerPage.getByTestId('review-compose-form')).toBeVisible();
		const submit = await seekerPage.request.post('/api/reviews', {
			data: {
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				rating: 5,
				body: 'Block-silence review body that must not notify.'
			}
		});
		expect(submit.status(), await submit.text()).toBe(201);
		await seekerCtx.close();

		const providerCtx = await browser.newContext();
		const providerPage = await providerCtx.newPage();
		await signIn(providerPage, SEED_REV_PROVIDER_EMAIL, SEED_REV_PROVIDER_PASSWORD, '/profile');
		const blockRes = await providerPage.request.post('/api/trust/blocks', {
			data: { blockedId: SEED_REV_ELIGIBLE_SEEKER_ID }
		});
		expect(blockRes.ok(), await blockRes.text()).toBeTruthy();

		try {
			const beforeInbox = await providerPage.request.get('/api/notifications/in-app?limit=50');
			expect(beforeInbox.ok()).toBeTruthy();
			const before = (await beforeInbox.json()) as { data: Array<{ id: string; category: string }> };
			const beforeIds = new Set(before.data.map((row) => row.id));

			const dispatch = await providerPage.request.post('/api/dev/notification-dispatch');
			expect(dispatch.ok()).toBeTruthy();
			const inbox = await providerPage.request.get('/api/notifications/in-app?limit=50');
			expect(inbox.ok()).toBeTruthy();
			const body = (await inbox.json()) as {
				data: Array<{ id: string; category: string }>;
			};
			const addedReviews = body.data.filter(
				(row) => row.category === 'review_received' && !beforeIds.has(row.id)
			);
			expect(addedReviews).toEqual([]);
		} finally {
			await providerPage.request.delete(`/api/trust/blocks/${SEED_REV_ELIGIBLE_SEEKER_ID}`);
			await providerCtx.close();
		}
	});
});
