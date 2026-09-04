import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hash';

describe('password-hash', () => {
	it('hashes and verifies passwords', async () => {
		const hash = await hashPassword('test-password-123');
		expect(hash).not.toBe('test-password-123');
		expect(await verifyPassword('test-password-123', hash)).toBe(true);
		expect(await verifyPassword('wrong', hash)).toBe(false);
	});
});
