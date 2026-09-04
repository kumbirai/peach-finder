import { describe, expect, it } from 'vitest';
import { validateDisplayName, validateEmail, validatePassword } from './password-policy';

describe('password-policy', () => {
	it('rejects short passwords', () => {
		expect(validatePassword('short')).toMatch(/at least/);
	});

	it('accepts valid passwords', () => {
		expect(validatePassword('longenough')).toBeNull();
	});

	it('validates email format', () => {
		expect(validateEmail('bad')).not.toBeNull();
		expect(validateEmail('good@example.com')).toBeNull();
	});

	it('validates display name length', () => {
		expect(validateDisplayName('A')).not.toBeNull();
		expect(validateDisplayName('Amara T.')).toBeNull();
	});
});
