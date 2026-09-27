import { isProductionUrl, productionTargetReason } from './production-guard';

export function stripSlash(url: string): string {
	return url.replace(/\/$/, '');
}

export function emailDomain(): string {
	return process.env.SEED_EMAIL_DOMAIN ?? 'example.com';
}

export function seedOnlyGlob(): string | undefined {
	const value = process.env.SEED_ONLY?.trim();
	return value ? value : undefined;
}

export function isProductionBaseUrl(baseUrl = process.env.E2E_BASE_URL ?? ''): boolean {
	if (baseUrl) return isProductionUrl(baseUrl);
	return productionTargetReason() != null;
}

/** glob-style match: * and ? only, used for SEED_ONLY. */
export function matchesGlob(value: string, glob: string): boolean {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`, 'i').test(value);
}

export function requiredEnvMessage(): string | null {
	const production = productionTargetReason();
	if (production) return `Refusing to seed production (${production})`;
	if (process.env.E2E_LIVE === '0') return 'Refusing to seed when E2E_LIVE=0';
	return null;
}
