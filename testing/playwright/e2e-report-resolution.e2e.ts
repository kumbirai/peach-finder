import { expect, test, type BrowserContextOptions } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD
} from '../../scripts/seed-core';
import { reportReasonLabels } from '../../src/lib/safety/report-flow';

function isProfilePage(url: string): boolean {
	return new URL(url).pathname === '/profile';
}

async function expectProfilePage(
	page: import('@playwright/test').Page,
	timeout = 15_000
): Promise<void> {
	await expect(page).toHaveURL(isProfilePage, { timeout });
}

async function signInSeeker(page: import('@playwright/test').Page, returnTo = '/profile'): Promise<void> {
	await page.goto(`/sign-in?flow=sign-in&returnTo=${encodeURIComponent(returnTo)}`);
	await page.getByLabel('Email').fill(SEED_DUAL_ROLE_EMAIL);
	await page.getByLabel('Password').fill(SEED_DUAL_ROLE_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expectProfilePage(page);
}

async function openThreadWithProvider(
	page: import('@playwright/test').Page,
	providerProfileId: string,
	firstMessage: string
): Promise<void> {
	const composeRes = await page.request.post('/api/messaging/threads', {
		data: {
			providerProfileId,
			body: firstMessage
		}
	});
	expect(composeRes.ok()).toBeTruthy();
	const body = (await composeRes.json()) as {
		data: { status: string; threadId?: string };
	};
	expect(body.data.status).toBe('sent');
	expect(body.data.threadId).toMatch(/^[0-9a-f-]{36}$/);
	await page.goto(`/messages/${body.data.threadId}`);
	await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/);
}

async function readProfileSnapshot(page: import('@playwright/test').Page, profileId: string) {
	const res = await page.request.get(`/api/provider/profile/${profileId}`);
	expect(res.ok()).toBeTruthy();
	return (await res.json()) as {
		data: {
			displayName: string;
			badges: { identityVerified: boolean; activeThisWeek: boolean };
		};
	};
}

test.describe.configure({ mode: 'serial' });

test.describe('US-SAFE-01 report anything from anywhere in two taps', () => {
	let seekerStorageState: BrowserContextOptions['storageState'];

	test.beforeAll(async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await signInSeeker(page);
		seekerStorageState = await context.storageState();
		await context.close();
	});

	test('TC-SAFE-01a: report reachable within two taps from profile', async ({ browser }) => {
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await page
			.getByRole('group', { name: 'Profile actions' })
			.getByRole('link', { name: 'Report' })
			.click();
		await expect(page).toHaveURL(new RegExp(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}/report`));
		await expect(page.getByTestId('report-reason-form')).toBeVisible();
		const reportResponse = page.waitForResponse(
			(res) => res.url().includes('/api/trust/reports') && res.request().method() === 'POST'
		);
		await page.getByRole('button', { name: 'Harassment' }).click();
		expect((await reportResponse).status()).toBe(201);
		await expect(page.getByText(/report started/i)).toBeVisible({ timeout: 15_000 });

		await context.close();
	});

	test('TC-SAFE-01a-thread: report reachable within two taps from conversation', async ({
		browser
	}) => {
		test.setTimeout(90_000);
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();

		await openThreadWithProvider(page, SEED_CORE_PRIMARY_PROFILE_ID, 'Thread report reachability');

		await page.getByTestId('thread-safety-toggle').click();
		const panel = page.getByTestId('thread-safety-panel');
		await expect(panel).toBeVisible({ timeout: 15_000 });
		await expect(panel.getByTestId('thread-safety-report')).toBeVisible();
		await expect(panel.getByTestId('thread-safety-block')).toBeVisible();

		await context.close();
	});

	test('TC-SAFE-01b: report reason list matches the fixed taxonomy', async ({ browser }) => {
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}/report`);
		const reasonGroup = page.getByRole('group', { name: 'Report reason' });
		for (const label of reportReasonLabels()) {
			await expect(reasonGroup.getByRole('button', { name: label })).toBeVisible();
		}
		await expect(reasonGroup.getByRole('button')).toHaveCount(reportReasonLabels().length);

		await context.close();
	});

	test('TC-SAFE-01c: receipt confirmed and reported profile state unchanged', async ({
		browser
	}) => {
		test.setTimeout(60_000);
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();

		const before = await readProfileSnapshot(page, SEED_CORE_PRIMARY_PROFILE_ID);

		const reportRes = await page.request.post('/api/trust/reports', {
			data: {
				targetType: 'profile',
				targetId: SEED_CORE_PRIMARY_PROFILE_ID,
				reason: 'spam_scam'
			}
		});
		expect(reportRes.status()).toBe(201);

		let found = false;
		for (let attempt = 0; attempt < 5 && !found; attempt++) {
			const dispatchRes = await page.request.post('/api/dev/notification-dispatch');
			expect(dispatchRes.ok()).toBeTruthy();
			const notifRes = await page.request.get('/api/notifications/in-app');
			expect(notifRes.ok()).toBeTruthy();
			const notifBody = (await notifRes.json()) as {
				data: Array<{ category: string; title: string }>;
			};
			found = notifBody.data.some((n) => n.category === 'report_receipt');
		}
		expect(found).toBeTruthy();

		const after = await readProfileSnapshot(page, SEED_CORE_PRIMARY_PROFILE_ID);
		expect(after.data.displayName).toBe(before.data.displayName);
		expect(after.data.badges).toEqual(before.data.badges);

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}`);
		await expect(page.getByTestId('profile-view')).toBeVisible();

		await context.close();
	});

	test('profile report page has no critical or serious axe violations', async ({ browser }) => {
		const context = await browser.newContext({ storageState: seekerStorageState });
		const page = await context.newPage();

		await page.goto(`/provider/${SEED_CORE_PRIMARY_PROFILE_ID}/report`);
		const results = await new AxeBuilder({ page })
			.include('[data-testid="profile-report-panel"]')
			.analyze();
		expect(
			results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
		).toEqual([]);

		await context.close();
	});
});
