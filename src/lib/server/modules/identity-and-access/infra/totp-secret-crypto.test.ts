import { describe, expect, it } from 'vitest';
import { newTotpSecretBytes } from '../domain/totp';
import { decryptTotpSecret, encryptTotpSecret } from './totp-secret-crypto';

describe('totp-secret-crypto', () => {
	it('round-trips a secret through AEAD', () => {
		const secret = newTotpSecretBytes();
		const encrypted = encryptTotpSecret(secret);
		expect(decryptTotpSecret(encrypted).equals(secret)).toBe(true);
	});
});
