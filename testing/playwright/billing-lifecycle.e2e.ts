import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';
import { assertPrimaryListingLive, assertSearchContainsProfile } from './live-backend-assert';

async function resetJordanListing(page: import('@playwright/test').Page): Promise<void> {
	const paidSeed = await page.request.post('/api/dev/billing-paid-listing', { data: {} });
	expect(paidSeed.ok(), await paidSeed.text()).toBeTruthy();

	const publicProfile = await page.request.get(`/api/provider/profile/${SEED_DUAL_ROLE_PROFILE_ID}`);
	if (!publicProfile.ok()) {
		const republish = await page.request.post('/api/provider/profile/publish');
		expect(republish.ok(), await republish.text()).toBeTruthy();
	}

	await assertSearchContainsProfile(page.request, SEED_DUAL_ROLE_PROFILE_ID, '?q=Jordan');
}

async function signInAsSeedProvider(page: import('@playwright/test').Page) {
	await page.goto('/sign-in?flow=sign-in&returnTo=/provider/billing');
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/provider\/billing/, { timeout: 15_000 });
}

test.describe('US-BILL-04 billing lifecycle (live stack)', () => {
	test('TC-BILL-04a-g: grace stays live, lapse copy is billing-framed, pay republishes', async ({
		page
	}) => {
		await signInAsSeedProvider(page);
		await resetJordanListing(page);

		const statusAfterSeed = await page.request.get('/api/billing/status');
		const statusSeedBody = (await statusAfterSeed.json()) as { data: { state: string } };
		expect(statusSeedBody.data.state).toBe('paid_listed');

		await page.request.post('/api/dev/billing-seed-lifecycle', {
			data: {
				state: 'grace',
				graceEndsAt: '2026-09-20T00:00:00.000Z'
			}
		});

		const graceStatus = await page.request.get('/api/billing/status');
		const graceBody = (await graceStatus.json()) as { data: { state: string } };
		expect(graceBody.data.state).toBe('grace');

		await assertSearchContainsProfile(page.request, SEED_DUAL_ROLE_PROFILE_ID, '?q=Jordan');

		await page.reload();
		await expect(page.getByTestId('listing-billing-what-happens-next')).toContainText(
			/visible in search/i
		);
		await expect(page.getByTestId('listing-billing-what-happens-next')).not.toContainText(
			/violation|moderation|penalty/i
		);

		await page.request.post('/api/dev/billing-seed-lifecycle', {
			data: {
				state: 'grace',
				graceEndsAt: '2026-09-01T00:00:00.000Z'
			}
		});

		const tickToUnpublished = await page.request.post('/api/dev/billing-lifecycle-tick', {
			data: { now: '2026-09-05T00:00:00.000Z' }
		});
		expect(tickToUnpublished.ok(), await tickToUnpublished.text()).toBeTruthy();

		const unpublishedStatus = await page.request.get('/api/billing/status');
		const unpublishedBody = (await unpublishedStatus.json()) as { data: { state: string } };
		expect(unpublishedBody.data.state).toBe('unpublished');

		await expect
			.poll(async () => {
				const searchAfterLapse = await page.request.get('/api/discovery/search');
				if (!searchAfterLapse.ok()) return null;
				const searchLapseBody = (await searchAfterLapse.json()) as {
					data: Array<{ displayName: string }>;
				};
				return searchLapseBody.data.some((card) => card.displayName.includes('Jordan'));
			})
			.toBe(false);

		await page.reload();
		await expect(page.getByTestId('billing-pay-listing')).toBeVisible();
		const payButton = page.getByTestId('billing-pay-listing').getByRole('button');
		await expect(payButton).toBeEnabled();
		await payButton.click();
		await expect
			.poll(async () => {
				const status = await page.request.get('/api/billing/status');
				if (!status.ok()) return '';
				const body = (await status.json()) as { data: { state: string } };
				return body.data.state;
			})
			.toBe('paid_listed');
		await page.goto('/provider/billing?notice=republish');
		await expect(page.getByTestId('billing-action-message')).toContainText(/republish/i, {
			timeout: 15_000
		});

		const republishedStatus = await page.request.get('/api/billing/status');
		const republishedBody = (await republishedStatus.json()) as { data: { state: string } };
		expect(republishedBody.data.state).toBe('paid_listed');

		await assertPrimaryListingLive(page.request);
		const accessibility = await new AxeBuilder({ page }).analyze();
		expect(
			accessibility.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toEqual([]);
	});

	test('TC-BILL-04d/e: webhook replay is idempotent and bad signatures are rejected', async ({
		page
	}) => {
		test.setTimeout(90_000);
		await signInAsSeedProvider(page);

		const chargeRes = await page.request.post('/api/dev/billing-simulate-webhook', {
			data: {
				reference: 'missing-ref',
				eventId: 'evt_missing',
				event: 'charge.success'
			}
		});
		expect(chargeRes.status()).toBe(404);

		const paidSeed = await page.request.post('/api/dev/billing-paid-listing', { data: {} });
		expect(paidSeed.ok(), await paidSeed.text()).toBeTruthy();
		const seed = await page.request.post('/api/dev/billing-seed-lifecycle', {
			data: { state: 'unpublished' }
		});
		expect(seed.ok(), await seed.text()).toBeTruthy();

		await page.reload();
		await expect(page.getByTestId('billing-pay-listing')).toBeVisible();
		const payRes = await page.request.post('/api/billing/subscription/pay');
		expect(payRes.ok(), await payRes.text()).toBeTruthy();
		const payBody = (await payRes.json()) as { data: { reference: string } };

		const statusBeforeWebhook = await page.request.get('/api/billing/status');
		expect(statusBeforeWebhook.ok()).toBeTruthy();
		const beforeWebhook = (await statusBeforeWebhook.json()) as { data: { state: string } };

		const webhookRes = await page.request.post('/api/dev/billing-simulate-webhook', {
			data: {
				reference: payBody.data.reference,
				eventId: 'evt_replay_test',
				event: 'charge.failed'
			}
		});
		expect(webhookRes.ok(), await webhookRes.text()).toBeTruthy();

		const statusAfterFailed = await page.request.get('/api/billing/status');
		expect(statusAfterFailed.ok()).toBeTruthy();
		const afterFailed = (await statusAfterFailed.json()) as { data: { state: string } };

		const replay = await page.request.post('/api/dev/billing-simulate-webhook', {
			data: {
				reference: payBody.data.reference,
				eventId: 'evt_replay_test',
				event: 'charge.failed'
			}
		});
		const replayBody = (await replay.json()) as { data: { status: string } };
		expect(replayBody.data.status).toBe('duplicate');

		const statusAfterReplay = await page.request.get('/api/billing/status');
		expect(statusAfterReplay.ok()).toBeTruthy();
		const afterReplay = (await statusAfterReplay.json()) as { data: { state: string } };
		expect(afterReplay.data.state).toBe(afterFailed.data.state);

		const badSignature = await page.request.post('/api/billing/webhooks/paystack', {
			headers: {
				'x-paystack-signature': 'invalid-signature',
				'content-type': 'application/json'
			},
			data: '{"id":"evt_bad","event":"charge.success","data":{}}'
		});
		expect(badSignature.status()).toBe(401);

		const statusAfterBadSig = await page.request.get('/api/billing/status');
		const afterBadSig = (await statusAfterBadSig.json()) as { data: { state: string } };
		expect(afterBadSig.data.state).toBe(afterReplay.data.state);
		expect(afterBadSig.data.state).toBeTruthy();
		expect(beforeWebhook.data.state).toBeTruthy();

		await page.reload();
		await expect(page.getByTestId('listing-billing-what-happens-next')).toBeVisible();
		await expect(page.getByTestId('billing-price-list')).toBeVisible();
	});

	test('TC-BILL-05a/b: featuring requires active listing and force-lapses with listing', async ({
		page
	}) => {
		await signInAsSeedProvider(page);

		await page.request.post('/api/dev/billing-seed-lifecycle', {
			data: { state: 'unpublished' }
		});

		const blocked = await page.request.post('/api/billing/featuring');
		expect(blocked.status()).toBe(412);

		const paidSeed = await page.request.post('/api/dev/billing-paid-listing', { data: {} });
		expect(paidSeed.ok(), await paidSeed.text()).toBeTruthy();

		await page.reload();
		await expect(page.getByTestId('billing-featuring-actions')).toBeVisible();
		const featuringPurchase = page.waitForResponse(
			(res) => res.url().includes('/api/billing/featuring') && res.request().method() === 'POST'
		);
		await page.getByTestId('billing-featuring-actions').getByRole('button').click();
		expect((await featuringPurchase).ok()).toBeTruthy();
		await expect(page.getByTestId('billing-featuring-active')).toBeVisible({ timeout: 15_000 });

		const statusAfterPurchase = await page.request.get('/api/billing/status');
		const statusBody = (await statusAfterPurchase.json()) as {
			data: { featuring: { active: boolean } };
		};
		expect(statusBody.data.featuring.active).toBe(true);

		await page.request.post('/api/dev/billing-seed-lifecycle', {
			data: {
				state: 'paid_listed',
				currentPeriodEndsAt: '2026-08-01T00:00:00.000Z',
				paymentMethod: false
			}
		});

		const tickToGrace = await page.request.post('/api/dev/billing-lifecycle-tick', {
			data: { now: '2026-09-05T00:00:00.000Z' }
		});
		expect(tickToGrace.ok(), await tickToGrace.text()).toBeTruthy();

		const statusAfterGrace = await page.request.get('/api/billing/status');
		const graceBody = (await statusAfterGrace.json()) as {
			data: { state: string; featuring: { active: boolean } };
		};
		expect(graceBody.data.state).toBe('grace');
		expect(graceBody.data.featuring.active).toBe(false);
	});
});
