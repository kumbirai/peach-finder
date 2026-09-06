/** Keys that must never appear in provider-facing analytics payloads (FR-ANLY-03, SR-PRIV-06). */
export const FORBIDDEN_IDENTIFYING_KEYS = [
	'viewerKey',
	'viewer_key',
	'seekerId',
	'seeker_id',
	'userId',
	'user_id',
	'email',
	'displayName',
	'display_name',
	'sessionId',
	'session_id',
	'ipAddress',
	'ip_address',
	'viewer',
	'viewers',
	'seeker',
	'seekers'
] as const;

function collectKeys(value: unknown, keys: Set<string>): void {
	if (value == null || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, keys);
		return;
	}
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		keys.add(key);
		collectKeys(nested, keys);
	}
}

export function findForbiddenIdentifyingKeys(payload: unknown): string[] {
	const keys = new Set<string>();
	collectKeys(payload, keys);
	return FORBIDDEN_IDENTIFYING_KEYS.filter((forbidden) => keys.has(forbidden));
}

/** Throws when a provider-facing analytics payload exposes seeker-identifying fields. */
export function assertAggregateOnlyPayload(payload: unknown): void {
	const forbidden = findForbiddenIdentifyingKeys(payload);
	if (forbidden.length > 0) {
		throw new Error(`Analytics payload exposes identifying fields: ${forbidden.join(', ')}`);
	}
}
