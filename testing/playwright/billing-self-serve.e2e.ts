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

test.describe('US-BILL-03 painless self-serve billing (live stack)', () => {
	test('TC-BILL-03a: card capture uses PSP-hosted page, never Peach Finder fields', async ({
		page
	}) => {
		await signInAsSeedProvider(page);
		await expect(page.getByTestId('provider-billing-page')).toBeVisible();

		const rejected = await page.request.post('/api/billing/payment-method', {
			data: { cardNumber: '4111111111111111', cvv: '123' }
		});
		expect(rejected.status()).toBe(422);
		const rejectedBody = (await rejected.json()) as {
			error: { message: string; fields: Array<{ message: string }> | null };
		};
		expect(rejectedBody.error.fields?.[0]?.message).toMatch(/secure payment partner/i);

		const init = await page.request.post('/api/billing/payment-method', {
			data: { returnUrl: `${page.url().split('/provider')[0]}/provider/billing?payment=complete` }
		});
		expect(init.ok(), await init.text()).toBeTruthy();
		const initBody = (await init.json()) as {
			data: { authorizationUrl: string; reference: string };
		};
		expect(initBody.data.authorizationUrl).toContain('/provider/billing/payment-method/hosted');

		await page.goto(initBody.data.authorizationUrl);
		await expect(page.getByTestId('billing-hosted-payment-page')).toBeVisible();
		await page.getByRole('button', { name: 'Save card securely' }).click();
		await expect(page).toHaveURL(/\/provider\/billing/, { timeout: 15_000 });
		await expect(page.getByTestId('billing-payment-on-file')).toContainText(/4242/);
	});

	test('TC-BILL-03b: price shown before purchase on billing page', async ({ page }) => {
		await signInAsSeedProvider(page);

		const priceRes = await page.request.get('/api/billing/price');
		expect(priceRes.ok()).toBeTruthy();
		const priceBody = (await priceRes.json()) as {
			data: { listing: { amountLabel: string }; featuring: { amountLabel: string } };
		};
		expect(priceBody.data.listing.amountLabel).toMatch(/^R/);
		expect(priceBody.data.featuring.amountLabel).toMatch(/^R/);

		await expect(page.getByTestId('billing-price-list')).toBeVisible();
		await expect(page.getByTestId('billing-price-list')).toContainText(/Listing subscription/i);
		await expect(page.getByTestId('billing-price-list')).toContainText(/Featuring add-on/i);
	});

	test('TC-BILL-03c: cancel renewal keeps listing live to period end', async ({ page }) => {
		await signInAsSeedProvider(page);

		const seedRes = await page.request.post('/api/dev/billing-paid-listing', {
			data: { currentPeriodEndsAt: '2026-10-15T00:00:00.000Z' }
		});
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();

		await page.reload();
		await expect(page.getByTestId('billing-cancel-renewal')).toBeVisible();

		const cancelRes = await page.request.post('/api/billing/subscription/cancel-renewal');
		expect(cancelRes.ok(), await cancelRes.text()).toBeTruthy();

		const statusRes = await page.request.get('/api/billing/status');
		expect(statusRes.ok()).toBeTruthy();
		const statusBody = (await statusRes.json()) as { data: { state: string } };
		expect(statusBody.data.state).toBe('paid_listed');

		await page.reload();
		await expect(page.getByTestId('billing-renewal-cancelled')).toBeVisible();
		await expect(page.getByTestId('billing-renewal-cancelled')).toContainText(/stays live/i);
	});

	test('TC-BILL-03d: itemized billing history after multiple events', async ({ page }) => {
		await signInAsSeedProvider(page);

		const beforeRes = await page.request.get('/api/billing/history');
		expect(beforeRes.ok()).toBeTruthy();
		const beforeBody = (await beforeRes.json()) as { data: unknown[] };
		const beforeCount = beforeBody.data.length;

		const seedRes = await page.request.post('/api/dev/billing-seed-invoices', {
			data: { count: 2 }
		});
		expect(seedRes.ok(), await seedRes.text()).toBeTruthy();

		const historyRes = await page.request.get('/api/billing/history');
		expect(historyRes.ok()).toBeTruthy();
		const historyBody = (await historyRes.json()) as {
			data: Array<{ lineItemLabel: string; pspInvoiceRef: string | null }>;
		};
		expect(historyBody.data.length).toBeGreaterThanOrEqual(beforeCount + 2);
		expect(historyBody.data.some((row) => row.lineItemLabel.includes('Listing'))).toBeTruthy();
		expect(historyBody.data.some((row) => row.pspInvoiceRef?.startsWith('TX_dev_'))).toBeTruthy();

		await page.reload();
		await expect(page.getByTestId('billing-history-list')).toBeVisible();
		expect(await page.getByTestId('billing-history-list').locator('li').count()).toBeGreaterThanOrEqual(
			beforeCount + 2
		);

		const axe = await new AxeBuilder({ page })
			.include('[data-testid="provider-billing-page"]')
			.analyze();
		expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
			[]
		);
	});
});
