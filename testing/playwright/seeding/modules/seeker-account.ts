import { expect } from '@playwright/test';
import { registerAndVerifySeeker } from '../../seeker-session';
import type { SeedContext, SeededPersona } from '../types';

export async function seedSeeker(ctx: SeedContext): Promise<SeededPersona> {
	await registerAndVerifySeeker(
		ctx.page,
		ctx.page.request,
		ctx.email,
		ctx.spec.password,
		ctx.spec.displayName
	);
	const ping = await ctx.page.request.get('/api/session/ping');
	expect(ping.ok(), await ping.text()).toBeTruthy();
	return {
		key: ctx.spec.key,
		role: 'seeker',
		displayName: ctx.spec.displayName,
		email: ctx.email,
		password: ctx.spec.password,
		phone: ctx.phone,
		completedJourneys: ['seeker-register', 'email-verify'],
		partial: ctx.partial
	};
}
