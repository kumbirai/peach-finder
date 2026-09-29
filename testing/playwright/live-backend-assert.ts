import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

async function restoreSeedCorePrimaryIfNeeded(request: APIRequestContext): Promise<void> {
	const profile = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
	if (profile.ok()) return;

	const restore = await request.post('/api/dev/restore-seed-core-primary');
	expect(restore.ok(), await restore.text()).toBeTruthy();
}

async function reconcileSearchProjection(request: APIRequestContext): Promise<void> {
	const reconcile = await request.post('/api/dev/search-projection-reconcile', {
		data: { action: 'reconcile' }
	});
	expect(reconcile.ok(), await reconcile.text()).toBeTruthy();
}

export async function assertPrimaryListingLive(request: APIRequestContext): Promise<void> {
	await restoreSeedCorePrimaryIfNeeded(request);

	let profile = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
	if (!profile.ok()) {
		await reconcileSearchProjection(request);
		profile = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
	}
	expect(profile.ok()).toBeTruthy();

	try {
		await assertSearchContainsProfile(request, SEED_CORE_PRIMARY_PROFILE_ID, '?q=deep+tissue');
	} catch {
		await reconcileSearchProjection(request);
		await assertSearchContainsProfile(request, SEED_CORE_PRIMARY_PROFILE_ID, '?q=deep+tissue');
	}
}

export async function assertSearchContainsProfile(
	request: APIRequestContext,
	profileId: string,
	query = ''
): Promise<void> {
	const probe = async (): Promise<void> => {
		const search = await request.get(`/api/discovery/search${query}`);
		expect(search.ok()).toBeTruthy();
		const body = (await search.json()) as { data: Array<{ providerProfileId: string }> };
		expect(body.data.map((card) => card.providerProfileId)).toContain(profileId);
	};

	try {
		await probe();
	} catch {
		await reconcileSearchProjection(request);
		await probe();
	}
}

export async function assertSeriousAxeAndListingLive(page: Page): Promise<void> {
	await assertPrimaryListingLive(page.request);
	const results = await new AxeBuilder({ page }).analyze();
	const serious = results.violations.filter(
		(v) => v.impact === 'critical' || v.impact === 'serious'
	);
	expect(serious).toEqual([]);
}
