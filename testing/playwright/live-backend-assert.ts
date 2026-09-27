import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { SEED_CORE_PRIMARY_PROFILE_ID } from '../../scripts/seed-core';

export async function assertPrimaryListingLive(request: APIRequestContext): Promise<void> {
	const profile = await request.get(`/api/provider/profile/${SEED_CORE_PRIMARY_PROFILE_ID}`);
	expect(profile.ok()).toBeTruthy();
	const search = await request.get('/api/discovery/search');
	expect(search.ok()).toBeTruthy();
	const body = (await search.json()) as { data: Array<{ providerProfileId: string }> };
	expect(body.data.map((card) => card.providerProfileId)).toContain(SEED_CORE_PRIMARY_PROFILE_ID);
}

export async function assertSearchContainsProfile(
	request: APIRequestContext,
	profileId: string,
	query = ''
): Promise<void> {
	const search = await request.get(`/api/discovery/search${query}`);
	expect(search.ok()).toBeTruthy();
	const body = (await search.json()) as { data: Array<{ providerProfileId: string }> };
	expect(body.data.map((card) => card.providerProfileId)).toContain(profileId);
}

export async function assertSeriousAxeAndListingLive(page: Page): Promise<void> {
	await assertPrimaryListingLive(page.request);
	const results = await new AxeBuilder({ page }).analyze();
	const serious = results.violations.filter(
		(v) => v.impact === 'critical' || v.impact === 'serious'
	);
	expect(serious).toEqual([]);
}
