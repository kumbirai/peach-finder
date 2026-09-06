import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_SLUGS, LEGAL_DOCUMENT_VERSIONS } from './legal-documents';

describe('legal documents', () => {
	it('tracks stable version identifiers for both required documents', () => {
		expect(LEGAL_DOCUMENT_SLUGS).toEqual(['privacy-policy', 'terms-of-service']);
		expect(LEGAL_DOCUMENT_VERSIONS['privacy-policy']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(LEGAL_DOCUMENT_VERSIONS['terms-of-service']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
