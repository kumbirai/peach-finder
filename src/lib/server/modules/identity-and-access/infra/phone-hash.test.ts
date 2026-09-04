import { describe, expect, it } from 'vitest';
import { hashPhone } from './phone-hash';

describe('hashPhone', () => {
	it('returns a stable hex digest for the same number', () => {
		const first = hashPhone('+27821234567');
		const second = hashPhone('+27821234567');
		expect(first).toBe(second);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
	});
});
