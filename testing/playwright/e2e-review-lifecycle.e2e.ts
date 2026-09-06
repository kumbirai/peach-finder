import { expect, test, type BrowserContextOptions } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_REV_ELIGIBLE_SEEKER_EMAIL,
	SEED_REV_ELIGIBLE_SEEKER_PASSWORD,
	SEED_REV_INELIGIBLE_REASON,
	SEED_REV_INELIGIBLE_SEEKER_EMAIL,
	SEED_REV_INELIGIBLE_SEEKER_ID,
	SEED_REV_INELIGIBLE_SEEKER_PASSWORD,
	SEED_REV_PROVIDER_PROFILE_ID
} from '../../scripts/seed-reviews';

async function signInSeeker(
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

test.describe.configure({ mode: 'serial' });

test.describe('US-REV-01 leave a review that counts', () => {
	let seekerStorageState: BrowserContextOptions['storageState'];

	test.beforeAll(async ({ browser, request }) => {
		const reseedRes = await request.post('/api/dev/reseed-reviews');
		expect(reseedRes.ok()).toBeTruthy();

		const ageRes = await request.post('/api/dev/review-thread-age', {
			data: {
				seekerId: SEED_REV_INELIGIBLE_SEEKER_ID,
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				ageHours: 12
			}
		});
		expect(ageRes.ok()).toBeTruthy();

		const context = await browser.newContext();
		const page = await context.newPage();
		await signInSeeker(
			page,
			SEED_REV_INELIGIBLE_SEEKER_EMAIL,
			SEED_REV_INELIGIBLE_SEEKER_PASSWORD,
			`/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`
		);
		seekerStorageState = await context.storageState();
		await context.close();
	});

	test('TC-REV-01b: ineligible review page explains why instead of hiding', async ({ browser }) => {
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();
		const reviewPath = `/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`;

		await page.goto(reviewPath);

		await expect(page.getByTestId('review-ineligible-reason')).toHaveText(
			SEED_REV_INELIGIBLE_REASON
		);
		await expect(page.getByTestId('review-compose-form')).toHaveCount(0);

		await page.goto(`/provider/${SEED_REV_PROVIDER_PROFILE_ID}`);
		await page
			.getByRole('group', { name: 'Profile actions' })
			.getByRole('link', { name: 'Review' })
			.click();
		await expect(page).toHaveURL(new RegExp(`/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`));
		await expect(page.getByTestId('review-ineligible-reason')).toBeVisible();

		const axe = await new AxeBuilder({ page }).include('[data-testid="review-panel"]').analyze();
		const serious = axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
		expect(serious).toEqual([]);

		await context.close();
	});

	test('TC-REV-01a: thread ages past 24h and compose form appears', async ({
		browser,
		request
	}) => {
		const tickRes = await request.post('/api/dev/review-thread-age', {
			data: {
				seekerId: SEED_REV_INELIGIBLE_SEEKER_ID,
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				ageHours: 48
			}
		});
		expect(tickRes.ok()).toBeTruthy();

		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();
		await page.goto(`/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`);
		await expect(page.getByTestId('review-compose-form')).toBeVisible();

		const eligibilityRes = await page.request.get(
			`/api/reviews/eligibility/${SEED_REV_PROVIDER_PROFILE_ID}`
		);
		expect(eligibilityRes.ok()).toBeTruthy();
		const eligibilityBody = (await eligibilityRes.json()) as { data: { eligible: boolean } };
		expect(eligibilityBody.data.eligible).toBe(true);

		await context.close();
	});

	test('TC-REV-01a/01c: eligible submit is live; duplicate rejected', async ({ browser }) => {
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();

		const submitRes = await page.request.post('/api/reviews', {
			data: {
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				rating: 5,
				body: 'Professional and attentive - would book again.'
			}
		});
		expect(submitRes.status(), await submitRes.text()).toBe(201);

		const profileRes = await page.request.get(
			`/api/reviews/provider/${SEED_REV_PROVIDER_PROFILE_ID}`
		);
		expect(profileRes.ok()).toBeTruthy();
		const profileBody = (await profileRes.json()) as { data: Array<{ body: string }> };
		expect(
			profileBody.data.some((review) => review.body.includes('Professional and attentive'))
		).toBe(true);

		await page.goto(`/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`);
		await expect(page.getByTestId('review-ineligible-reason')).toContainText('already reviewed');

		const duplicateRes = await page.request.post('/api/reviews', {
			data: {
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				rating: 4,
				body: 'Second try'
			}
		});
		expect(duplicateRes.status()).toBe(409);
		const duplicateBody = (await duplicateRes.json()) as { error: { code: string } };
		expect(duplicateBody.error.code).toBe('REVIEW_ALREADY_EXISTS');

		await context.close();
	});
});

test.describe('US-REV-02 live immediately, human-removable only', () => {
	test.beforeAll(async ({ browser, request }) => {
		const reseedRes = await request.post('/api/dev/reseed-reviews');
		expect(reseedRes.ok()).toBeTruthy();

		const ageRes = await request.post('/api/dev/review-thread-age', {
			data: {
				seekerId: SEED_REV_INELIGIBLE_SEEKER_ID,
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				ageHours: 48
			}
		});
		expect(ageRes.ok()).toBeTruthy();

		const context = await browser.newContext();
		const page = await context.newPage();
		await signInSeeker(
			page,
			SEED_REV_INELIGIBLE_SEEKER_EMAIL,
			SEED_REV_INELIGIBLE_SEEKER_PASSWORD,
			`/provider/${SEED_REV_PROVIDER_PROFILE_ID}/review`
		);

		const submitRes = await page.request.post('/api/reviews', {
			data: {
				providerProfileId: SEED_REV_PROVIDER_PROFILE_ID,
				rating: 5,
				body: 'Professional and attentive - would book again.'
			}
		});
		expect(submitRes.status(), await submitRes.text()).toBe(201);
		await context.close();
	});

	test('TC-REV-02a: submitted review is live on profile with no pending state', async ({
		browser
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_REV_PROVIDER_PROFILE_ID}`);
		await expect(page.getByTestId('profile-reviews')).toBeVisible();
		await expect(
			page.getByTestId('profile-review-item').filter({
				hasText: 'Professional and attentive'
			})
		).toBeVisible();
		await expect(page.getByText(/pending|queued|under review/i)).toHaveCount(0);

		await context.close();
	});

	test('TC-REV-02b: rating aggregate reflects new review in the same profile read', async ({
		request
	}) => {
		const profileRes = await request.get(`/api/provider/profile/${SEED_REV_PROVIDER_PROFILE_ID}`);
		expect(profileRes.ok()).toBeTruthy();
		const profileBody = (await profileRes.json()) as {
			data: { rating: { average: number; count: number } | { state: 'new' } };
		};
		expect(profileBody.data.rating).toEqual({ average: 4.5, count: 2 });
	});

	test('TC-REV-02c: reporting a review does not remove it', async ({ browser, request }) => {
		const reviewsRes = await request.get(`/api/reviews/provider/${SEED_REV_PROVIDER_PROFILE_ID}`);
		expect(reviewsRes.ok()).toBeTruthy();
		const reviewsBody = (await reviewsRes.json()) as {
			data: Array<{ id: string; body: string }>;
		};
		const target = reviewsBody.data.find((review) =>
			review.body.includes('Professional and attentive')
		);
		expect(target).toBeDefined();

		const context = await browser.newContext();
		const page = await context.newPage();
		await signInSeeker(
			page,
			SEED_REV_ELIGIBLE_SEEKER_EMAIL,
			SEED_REV_ELIGIBLE_SEEKER_PASSWORD,
			`/provider/${SEED_REV_PROVIDER_PROFILE_ID}`
		);

		for (const reason of ['spam_scam', 'harassment'] as const) {
			const reportRes = await page.request.post('/api/trust/reports', {
				data: {
					targetType: 'review',
					targetId: target!.id,
					reason
				}
			});
			expect(reportRes.status(), await reportRes.text()).toBe(201);
		}

		const afterRes = await page.request.get(
			`/api/reviews/provider/${SEED_REV_PROVIDER_PROFILE_ID}`
		);
		expect(afterRes.ok()).toBeTruthy();
		const afterBody = (await afterRes.json()) as { data: Array<{ id: string }> };
		expect(afterBody.data.some((review) => review.id === target!.id)).toBe(true);

		await context.close();
	});
});
