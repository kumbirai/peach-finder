import { expect } from '@playwright/test';
import { registerAndPublishProvider } from '../../provider-session';
import type { SeedContext, SeededPersona } from '../types';

export async function seedProvider(ctx: SeedContext): Promise<SeededPersona> {
	await registerAndPublishProvider(ctx.page, ctx.page.request, {
		name: ctx.spec.displayName,
		email: ctx.email,
		phone: ctx.phone,
		password: ctx.spec.password
	});

	await ctx.page.goto('/provider/dashboard');
	await expect(ctx.page).toHaveURL(/\/provider\/dashboard/, { timeout: 15_000 });
	const toggle = ctx.page.getByTestId('availability-toggle');
	if (await toggle.isVisible()) {
		const checked = await toggle.getAttribute('aria-checked');
		if (checked !== 'true') {
			await toggle.click();
			await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
		}
	} else {
		ctx.markPartial('availability toggle missing on dashboard');
	}

	const meRes = await ctx.page.request.get('/api/provider/me/profile');
	expect(meRes.ok(), await meRes.text()).toBeTruthy();
	const meBody = (await meRes.json()) as { data: { profileId: string; userId?: string } };

	const search = await ctx.page.request.get(
		`/api/discovery/search?q=${encodeURIComponent(ctx.spec.displayName)}`
	);
	expect(search.ok()).toBeTruthy();
	const searchBody = (await search.json()) as { data: Array<{ providerProfileId: string }> };
	expect(searchBody.data.map((card) => card.providerProfileId)).toContain(meBody.data.profileId);

	return {
		key: ctx.spec.key,
		role: 'provider',
		displayName: ctx.spec.displayName,
		email: ctx.email,
		password: ctx.spec.password,
		phone: ctx.phone,
		profileId: meBody.data.profileId,
		userId: meBody.data.userId,
		completedJourneys: ['provider-register', 'onboarding-publish', 'availability-on', 'search-visible'],
		partial: ctx.partial
	};
}
