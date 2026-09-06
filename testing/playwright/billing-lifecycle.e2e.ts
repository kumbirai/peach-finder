import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD } from '../../scripts/seed-core';

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

		const paidSeed = await page.request.post('/api/dev/billing-paid-listing', { data: {} });
		expect(paidSeed.ok(), await paidSeed.text()).toBeTruthy();

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

		const searchWhileGrace = await page.request.get('/api/discovery/search');
		expect(searchWhileGrace.ok()).toBeTruthy();
		const searchGraceBody = (await searchWhileGrace.json()) as {
			data: Array<{ displayName: string }>;
		};
		expect(searchGraceBody.data.some((card) => card.displayName.includes('Jordan'))).toBeTruthy();

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

		const searchAfterLapse = await page.request.get('/api/discovery/search');
		const searchLapseBody = (await searchAfterLapse.json()) as {
			data: Array<{ displayName: string }>;
		};
		expect(searchLapseBody.data.some((card) => card.displayName.includes('Jordan'))).toBe(false);

		await page.reload();
		await expect(page.getByTestId('billing-pay-listing')).toBeVisible();
		await page.getByTestId('billing-pay-listing').getByRole('button').click();
		await expect(page.getByTestId('billing-action-message')).toContainText(/republish/i, {
			timeout: 15_000
		});

		const republishedStatus = await page.request.get('/api/billing/status');
		const republishedBody = (await republishedStatus.json()) as { data: { state: string } };
		expect(republishedBody.data.state).toBe('paid_listed');

		const accessibility = await new AxeBuilder({ page }).analyze();
		expect(
			accessibility.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toEqual([]);
	});

	test('TC-BILL-04d/e: webhook replay is idempotent and bad signatures are rejected', async ({
		page
	}) => {
		await signInAsSeedProvider(page);

		const chargeRes = await page.request.post('/api/dev/billing-simulate-webhook', {
			data: {
				reference: 'missing-ref',
				eventId: 'evt_missing',
				event: 'charge.success'
			}
		});
		expect(chargeRes.status()).toBe(404);

		const seed = await page.request.post('/api/dev/billing-seed-lifecycle', {
			data: {
				state: 'paid_listed',
				currentPeriodEndsAt: '2026-08-01T00:00:00.000Z'
			}
		});
		expect(seed.ok()).toBeTruthy();

		const payRes = await page.request.post('/api/billing/subscription/pay');
		expect(payRes.ok(), await payRes.text()).toBeTruthy();
		const payBody = (await payRes.json()) as { data: { reference: string } };

		const webhookRes = await page.request.post('/api/dev/billing-simulate-webhook', {
			data: {
				reference: payBody.data.reference,
				eventId: 'evt_replay_test',
				event: 'charge.failed'
			}
		});
		expect(webhookRes.ok(), await webhookRes.text()).toBeTruthy();

		const replay = await page.request.post('/api/dev/billing-simulate-webhook', {
			data: {
				reference: payBody.data.reference,
				eventId: 'evt_replay_test',
				event: 'charge.failed'
			}
		});
		const replayBody = (await replay.json()) as { data: { status: string } };
		expect(replayBody.data.status).toBe('duplicate');

		const badSignature = await page.request.post('/api/billing/webhooks/paystack', {
			headers: {
				'x-paystack-signature': 'invalid-signature',
				'content-type': 'application/json'
			},
			data: '{"id":"evt_bad","event":"charge.success","data":{}}'
		});
		expect(badSignature.status()).toBe(401);
	});
});
