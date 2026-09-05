import { describe, expect, it } from 'vitest';
import { generateTotpCode, newTotpSecretBytes, verifyTotpCode } from './totp';

describe('totp domain', () => {
	it('generates and verifies a six-digit code for the current window', () => {
		const secret = newTotpSecretBytes();
		const now = new Date('2026-09-06T10:00:00.000Z');
		const code = generateTotpCode(secret, now);
		expect(code).toMatch(/^\d{6}$/);
		expect(verifyTotpCode(secret, code, now)).toBe(true);
	});

	it('rejects malformed codes', () => {
		const secret = newTotpSecretBytes();
		const now = new Date();
		expect(verifyTotpCode(secret, 'abc', now)).toBe(false);
	});
});
