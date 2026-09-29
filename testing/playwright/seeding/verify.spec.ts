import { expect, test } from '@playwright/test';
import { signInAdminViaLoginForm } from '../admin-session';
import { signInSeeker } from '../seeker-session';
import { assertSearchContainsProfile } from '../live-backend-assert';
import { readManifest, requirePersona } from './manifest';
import { isProductionBaseUrl, requiredEnvMessage } from './seed.config';

const PUBLISH_INTRO_SEARCH = 'sports recovery';

test.describe.configure({ mode: 'serial', retries: 0 });

test.beforeAll(() => {
	const blocked = requiredEnvMessage();
	expect(blocked, blocked ?? 'verification environment is configured').toBeNull();
	expect(isProductionBaseUrl(), 'refusing production').toBeFalsy();
	expect(readManifest().personas.length, 'run npm run test:seeding first').toBeGreaterThan(0);
});

test('verify UI-seeded provider is live in search and profile', async ({ page }) => {
	const provider = requirePersona('ui-provider-available');
	expect(provider.profileId).toBeTruthy();
	const profileId = provider.profileId!;

	const api = await page.request.get(`/api/provider/profile/${profileId}`);
	expect(api.ok()).toBeTruthy();
	const body = (await api.json()) as { data: { displayName: string } };
	expect(body.data.displayName).toBe(provider.displayName);

	await assertSearchContainsProfile(
		page.request,
		profileId,
		`?q=${encodeURIComponent(PUBLISH_INTRO_SEARCH)}`
	);

	await page.goto('/');
	await expect(
		page.locator(`a[href="/provider/${profileId}"]`).filter({ hasText: provider.displayName })
	).toBeVisible({
		timeout: 15_000
	});
	await page.goto(`/provider/${profileId}`);
	await expect(page.getByRole('heading', { level: 1, name: provider.displayName })).toBeVisible();
});

test('verify UI-seeded seeker can sign in through the form', async ({ page }) => {
	const seeker = requirePersona('ui-seeker');
	await signInSeeker(page, seeker.email, seeker.password, '/profile');
	const ping = await page.request.get('/api/session/ping');
	expect(ping.ok(), await ping.text()).toBeTruthy();
});

test('admin account lookup finds the UI-seeded provider via the live console', async ({ page }) => {
	const provider = requirePersona('ui-provider-available');
	await signInAdminViaLoginForm(page, { returnTo: '/admin/accounts' });
	await expect(page.getByTestId('admin-account-lookup')).toBeVisible();
	await page.getByLabel('Search accounts').fill(provider.email);
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page.getByTestId('account-lookup-results')).toBeVisible({ timeout: 15_000 });
	await expect(
		page.getByTestId('account-lookup-item').filter({ hasText: provider.email })
	).toBeVisible();
});
