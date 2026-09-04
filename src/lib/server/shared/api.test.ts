import { describe, expect, it } from 'vitest';
import { unauthenticatedHttp, useCaseErrorToHttp } from './api';

describe('UseCaseError HTTP mapping', () => {
	it('maps unauthenticated to 401', () => {
		expect(unauthenticatedHttp().status).toBe(401);
		expect(unauthenticatedHttp().body.error.code).toBe('UNAUTHENTICATED');
	});

	it('maps not_found to 404', () => {
		expect(useCaseErrorToHttp({ kind: 'not_found', resource: 'user' }).status).toBe(404);
	});

	it('maps rate_limited to 429', () => {
		expect(useCaseErrorToHttp({ kind: 'rate_limited', retryAfterSeconds: 12 }).status).toBe(429);
	});

	it('maps validation to 422 with fields', () => {
		const mapped = useCaseErrorToHttp({
			kind: 'validation_failed',
			issues: [{ path: 'email', message: 'Enter a valid email address.' }]
		});
		expect(mapped.status).toBe(422);
		expect(mapped.body.error.fields).toEqual([
			{ path: 'email', message: 'Enter a valid email address.' }
		]);
	});
});
