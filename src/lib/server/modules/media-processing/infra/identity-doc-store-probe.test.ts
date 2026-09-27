import { describe, expect, it } from 'vitest';
import { isAnonymousObjectDenied } from './identity-doc-store-probe';

describe('identity-doc store probe', () => {
	it('treats 403 and 404 as store-level denial, not 200', () => {
		expect(isAnonymousObjectDenied(403)).toBe(true);
		expect(isAnonymousObjectDenied(404)).toBe(true);
		expect(isAnonymousObjectDenied(200)).toBe(false);
		expect(isAnonymousObjectDenied(302)).toBe(false);
	});
});
