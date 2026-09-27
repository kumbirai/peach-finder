const FORBIDDEN_KEY = /^(psp|password|secret|authorization|objectkey|identity.?docs?)/i;

export function stripForbiddenExportKeys<T>(value: T): T {
	return stripValue(value) as T;
}

function stripValue(value: unknown): unknown {
	if (value == null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(stripValue);
	const out: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		if (FORBIDDEN_KEY.test(key.replaceAll('_', ''))) continue;
		if (typeof nested === 'string' && nested.includes('identity-docs/')) continue;
		out[key] = stripValue(nested);
	}
	return out;
}

export function exportPayloadHasForbiddenMaterial(value: unknown): boolean {
	if (value == null || typeof value !== 'object') {
		return typeof value === 'string' && value.includes('identity-docs/');
	}
	if (Array.isArray(value)) return value.some(exportPayloadHasForbiddenMaterial);
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		if (FORBIDDEN_KEY.test(key.replaceAll('_', ''))) return true;
		if (exportPayloadHasForbiddenMaterial(nested)) return true;
	}
	return false;
}
