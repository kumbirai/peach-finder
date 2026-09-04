import { describe, expect, it } from 'vitest';
import { REAUTH_MAX_AGE_MS, reauthIsValid } from './session-policy';

describe('reauthIsValid', () => {
	it('accepts a stamp within the 15-minute window', () => {
		const now = new Date('2026-09-04T12:00:00Z');
		const reauthAt = new Date(now.getTime() - REAUTH_MAX_AGE_MS + 1_000);
		expect(reauthIsValid(reauthAt, now)).toBe(true);
	});

	it('rejects missing or stale reauth stamps', () => {
		const now = new Date('2026-09-04T12:00:00Z');
		expect(reauthIsValid(null, now)).toBe(false);
		expect(reauthIsValid(new Date(now.getTime() - REAUTH_MAX_AGE_MS - 1), now)).toBe(false);
	});
});
