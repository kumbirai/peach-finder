import { expect, test } from '@playwright/test';
import {
	SEED_DUAL_ROLE_EMAIL,
	SEED_DUAL_ROLE_PASSWORD,
	SEED_DUAL_ROLE_PROFILE_ID
} from '../../scripts/seed-core';

const RETENTION_NOW = '2026-09-06T12:00:00.000Z';

async function signIn(
	page: import('@playwright/test').Page,
	email: string,
	password: string,
	returnTo = '/profile'
) {
	await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}&flow=sign-in`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(new RegExp(returnTo.replace('/', '\\/')));
}

async function registerAndVerifySeeker(
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext,
	email: string,
	password: string,
	name: string
) {
	await page.goto('/sign-in?returnTo=/profile');
	await page.getByLabel('Your name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.locator('input[name="acceptedTerms"]').check();
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/profile/);
	await page.waitForLoadState('domcontentloaded');

	let tokenRes = await request.post('/api/dev/verification-token', { data: { email } });
	if (!tokenRes.ok()) {
		await page.waitForTimeout(500);
		tokenRes = await request.post('/api/dev/verification-token', { data: { email } });
	}
	expect(tokenRes.ok()).toBe(true);
	const { data } = (await tokenRes.json()) as { data: { token: string } };
	await page.goto(`/verify-email?token=${data.token}&returnTo=/profile`, {
		waitUntil: 'domcontentloaded'
	});
	await page.getByRole('button', { name: 'Verify email' }).click();
	await expect(page).toHaveURL(/\/profile/);
}

test.describe.configure({ mode: 'serial' });

test.describe('US-PRIV-03 data that expires on schedule', () => {
	test('TC-PRIV-03a: identity docs purge at 90 days post-decision', async ({ request }) => {
		const seedRes = await request.post('/api/dev/retention-fixture', {
			data: { scenario: 'identity-doc', now: RETENTION_NOW }
		});
		expect(seedRes.ok()).toBeTruthy();
		const seedBody = (await seedRes.json()) as {
			data: { caseId: string; photoId: string };
		};

		const tickRes = await request.post('/api/dev/retention-tick', {
			data: { now: RETENTION_NOW }
		});
		expect(tickRes.ok()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { identityDocs: { casesPurged: number } };
		};
		expect(tickBody.data.identityDocs.casesPurged).toBeGreaterThanOrEqual(1);

		const verifyRes = await request.post('/api/dev/retention-verify', {
			data: {
				scenario: 'identity-doc',
				caseId: seedBody.data.caseId,
				photoId: seedBody.data.photoId
			}
		});
		expect(verifyRes.ok()).toBeTruthy();
		const verifyBody = (await verifyRes.json()) as {
			data: { metadataRetained: boolean; docsPurgedAt: string | null; photoRemoved: boolean };
		};
		expect(verifyBody.data.metadataRetained).toBe(true);
		expect(verifyBody.data.docsPurgedAt).toBeTruthy();
		expect(verifyBody.data.photoRemoved).toBe(true);
	});

	test('TC-PRIV-03b: dormant thread purge at 24 months', async ({ request }) => {
		const seedRes = await request.post('/api/dev/retention-fixture', {
			data: { scenario: 'dormant-thread', now: RETENTION_NOW }
		});
		expect(seedRes.ok()).toBeTruthy();
		const seedBody = (await seedRes.json()) as { data: { seekerId: string } };

		const tickRes = await request.post('/api/dev/retention-tick', {
			data: { now: RETENTION_NOW }
		});
		expect(tickRes.ok()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { dormantThreads: { threadsPurged: number } };
		};
		expect(tickBody.data.dormantThreads.threadsPurged).toBeGreaterThanOrEqual(1);

		const verifyRes = await request.post('/api/dev/retention-verify', {
			data: {
				scenario: 'dormant-thread',
				seekerId: seedBody.data.seekerId
			}
		});
		expect(verifyRes.ok()).toBeTruthy();
		const verifyBody = (await verifyRes.json()) as {
			data: { threadPurged: boolean };
		};
		expect(verifyBody.data.threadPurged).toBe(true);
	});

	test('TC-PRIV-03c: deletion anonymizes the seeker while the thread history remains', async ({
		page,
		request
	}) => {
		test.setTimeout(90_000);
		const email = `retention-delete-${Date.now()}@example.com`;
		const password = 'password123';
		const messageBody = `Retention anonymization ${Date.now()}`;

		await registerAndVerifySeeker(page, request, email, password, 'Retention Delete Seeker');

		const composeRes = await page.request.post('/api/messaging/threads', {
			data: {
				providerProfileId: SEED_DUAL_ROLE_PROFILE_ID,
				body: messageBody
			}
		});
		expect(composeRes.ok()).toBe(true);

		await page.goto('/profile?deleteConfirm=1');
		const deleteRes = await page.request.delete('/api/identity/account', {
			data: { password, confirm: true }
		});
		expect(deleteRes.ok()).toBe(true);

		const ping = await page.request.get('/api/session/ping');
		expect(ping.status()).toBe(401);

		const login = await page.request.post('/sign-in?/login', {
			form: {
				email,
				password,
				returnTo: '/profile',
				messageDraft: ''
			}
		});
		const loginBody = await login.text();
		expect(login.status() === 403 || /invalid email or password/i.test(loginBody)).toBeTruthy();
		const loginPing = await page.request.get('/api/session/ping');
		expect(loginPing.status()).toBeGreaterThanOrEqual(400);

		await signIn(page, SEED_DUAL_ROLE_EMAIL, SEED_DUAL_ROLE_PASSWORD, '/provider/dashboard');
		const inbox = page.locator('section').filter({
			has: page.getByRole('heading', { name: 'Messages from seekers' })
		});
		const thread = inbox.locator('li').filter({ hasText: messageBody });
		await expect(thread.getByText('Deleted account')).toBeVisible();
		await expect(thread.getByText(messageBody)).toBeVisible();
	});

	test('TC-PRIV-03d: raw analytics destroyed at 90 days while aggregates survive', async ({
		request
	}) => {
		const seedRes = await request.post('/api/dev/retention-fixture', {
			data: { scenario: 'analytics', now: RETENTION_NOW }
		});
		expect(seedRes.ok()).toBeTruthy();

		const tickRes = await request.post('/api/dev/retention-tick', {
			data: { now: RETENTION_NOW }
		});
		expect(tickRes.ok()).toBeTruthy();
		const tickBody = (await tickRes.json()) as {
			data: { analytics: { purgedRawEvents: number } };
		};
		expect(tickBody.data.analytics.purgedRawEvents).toBeGreaterThanOrEqual(1);

		const verifyRes = await request.post('/api/dev/retention-verify', {
			data: { scenario: 'analytics' }
		});
		expect(verifyRes.ok()).toBeTruthy();
		const verifyBody = (await verifyRes.json()) as {
			data: { rawEventsRemaining: number; rollupProfileViews: number };
		};
		expect(verifyBody.data.rawEventsRemaining).toBe(1);
		expect(verifyBody.data.rollupProfileViews).toBeGreaterThan(0);
	});
});
