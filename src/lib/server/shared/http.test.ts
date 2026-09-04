import { describe, expect, it } from 'vitest';
import { safeFetch, UnsafeHostError } from './http';

describe('safeFetch', () => {
	it('rejects hosts outside the allowlist before connecting', async () => {
		await expect(
			safeFetch('https://evil.example', { timeoutMs: 50, allowedHosts: ['allowed.example'] })
		).rejects.toBeInstanceOf(UnsafeHostError);
	});
});
