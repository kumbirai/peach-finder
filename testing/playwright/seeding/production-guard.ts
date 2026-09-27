export const SEEDING_URL_ENV = ['E2E_BASE_URL', 'PUBLIC_APP_ORIGIN'] as const;

const PRODUCTION_APEX = new Set(['peachfinder.com', 'peach-finder.com']);

export function isProductionHostname(hostname: string | undefined): boolean {
	if (!hostname) return false;
	const labels = String(hostname)
		.toLowerCase()
		.replace(/\.$/, '')
		.split('.')
		.filter(Boolean);
	if (labels.length < 2) return false;
	const apex = labels.slice(-2).join('.');
	if (!PRODUCTION_APEX.has(apex)) return false;
	const prefix = labels.slice(0, -2);
	if (prefix.some((label) => label === 'staging' || label === 'dev' || label === 'local')) {
		return false;
	}
	return true;
}

export function isProductionUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		return isProductionHostname(new URL(url).hostname);
	} catch {
		return false;
	}
}

export function productionTargetReason(env: NodeJS.Dict<string> = process.env): string | null {
	for (const key of SEEDING_URL_ENV) {
		const value = env[key];
		if (value && isProductionUrl(value)) {
			let host = value;
			try {
				host = new URL(value).hostname;
			} catch {
				/* keep raw */
			}
			return `${key} resolves to production host ${host}`;
		}
	}
	return null;
}
