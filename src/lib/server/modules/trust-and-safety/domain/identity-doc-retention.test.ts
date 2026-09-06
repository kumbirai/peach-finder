import { describe, expect, it } from 'vitest';
import { isIdentityDocPurgeDue, IDENTITY_DOC_RETENTION_MS } from './identity-doc-retention';

describe('identity-doc-retention', () => {
	it('is due at exactly 90 days and not at 89 days', () => {
		const now = new Date('2026-09-06T12:00:00.000Z');
		const exactly90 = new Date(now.getTime() - IDENTITY_DOC_RETENTION_MS);
		const at89 = new Date(now.getTime() - IDENTITY_DOC_RETENTION_MS + 24 * 60 * 60_000);

		expect(isIdentityDocPurgeDue(exactly90, now)).toBe(true);
		expect(isIdentityDocPurgeDue(at89, now)).toBe(false);
	});
});
