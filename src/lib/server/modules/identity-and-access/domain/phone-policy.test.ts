import { describe, expect, it } from 'vitest';
import { maskPhone, normalizePhoneE164, validatePhone } from './phone-policy';

describe('phone-policy', () => {
	it('normalizes local 0-prefix numbers to E.164', () => {
		expect(normalizePhoneE164('082 123 4567')).toBe('+27821234567');
	});

	it('accepts +27 E.164 numbers', () => {
		expect(normalizePhoneE164('+27821234567')).toBe('+27821234567');
	});

	it('rejects invalid numbers', () => {
		expect(normalizePhoneE164('12345')).toBeNull();
		expect(validatePhone('not-a-phone')).toMatch(/valid South African/);
	});

	it('masks trailing digits for display', () => {
		expect(maskPhone('+27821234567')).toBe('•••• 4567');
	});
});
