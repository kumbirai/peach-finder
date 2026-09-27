import { emailDomain } from './seed.config';
import * as providerListing from './modules/provider-listing';
import * as seekerAccount from './modules/seeker-account';
import { signOutIfNeeded } from '../seeker-session';
import type { SeedContext, SeededPersona, SeedPersonaSpec } from './types';

function uniqueContact(spec: SeedPersonaSpec): { email: string; phone: string } {
	const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
	return {
		email: `${spec.key}.${stamp}@${emailDomain()}`,
		phone: `082${stamp.slice(-7)}`
	};
}

export async function seedOnePersona(
	page: import('@playwright/test').Page,
	spec: SeedPersonaSpec
): Promise<SeededPersona> {
	const { email, phone } = uniqueContact(spec);
	const ctx: SeedContext = {
		page,
		spec,
		email,
		phone,
		partial: false,
		markPartial: (reason: string) => {
			ctx.partial = true;
			console.warn(`[seed] ${spec.key} partial: ${reason}`);
		}
	};
	await signOutIfNeeded(page);
	if (spec.role === 'provider') return providerListing.seedProvider(ctx);
	return seekerAccount.seedSeeker(ctx);
}
