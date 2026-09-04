import { describe, expect, it } from 'vitest';
import {
	ANONYMIZED_DISPLAY_NAME,
	buildAnonymizedUserFields,
	isPiiFullyScrubbed
} from './anonymize-user';

describe('buildAnonymizedUserFields', () => {
	it('nulls every PII field and sets the tombstone display name', () => {
		const now = new Date('2026-09-05T00:00:00Z');
		const fields = buildAnonymizedUserFields(now);
		expect(fields).toEqual({
			email: null,
			emailVerifiedAt: null,
			phone: null,
			phoneVerifiedAt: null,
			passwordHash: null,
			displayName: ANONYMIZED_DISPLAY_NAME,
			anonymizedAt: now
		});
		expect(isPiiFullyScrubbed(fields)).toBe(true);
	});

	it('detects partially scrubbed rows', () => {
		expect(
			isPiiFullyScrubbed({
				email: 'a@b.com',
				phone: null,
				passwordHash: null,
				displayName: ANONYMIZED_DISPLAY_NAME
			})
		).toBe(false);
	});
});
