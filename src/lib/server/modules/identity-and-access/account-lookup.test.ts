import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from './infra/account-lookup';

describe('escapeLikePattern', () => {
	it('escapes ILIKE metacharacters so literals match exactly', () => {
		expect(escapeLikePattern('%')).toBe('\\%');
		expect(escapeLikePattern('a_b')).toBe('a\\_b');
		expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
	});
});
