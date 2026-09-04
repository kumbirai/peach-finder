import { describe, expect, it } from 'vitest';
import { parseProviderProfileId } from './index';

describe('parseProviderProfileId', () => {
	it('accepts a UUIDv7 profile id', () => {
		const parsed = parseProviderProfileId('01900000-0000-7000-8000-000000000101');
		expect(parsed.ok).toBe(true);
	});

	it('maps malformed ids to not_found instead of throwing', () => {
		const parsed = parseProviderProfileId('not-a-uuid');
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error.kind).toBe('not_found');
		}
	});
});
