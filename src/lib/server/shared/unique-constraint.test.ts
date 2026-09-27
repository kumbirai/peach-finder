import { describe, expect, it } from 'vitest';
import { isUniqueConstraintViolation } from './unique-constraint';

describe('isUniqueConstraintViolation', () => {
	it('recognizes Postgres 23505 on the error or its cause', () => {
		expect(isUniqueConstraintViolation({ code: '23505' })).toBe(true);
		expect(isUniqueConstraintViolation(new Error('Failed query', { cause: { code: '23505' } }))).toBe(
			true
		);
	});

	it('recognizes drizzle Failed query text that mentions a unique violation', () => {
		expect(
			isUniqueConstraintViolation(new Error('Failed query: insert into thread duplicate key'))
		).toBe(true);
	});

	it('rejects unrelated failures', () => {
		expect(isUniqueConstraintViolation(new Error('Failed query: insert into thread'))).toBe(false);
	});
});
