export type LegalDocumentSlug = 'privacy-policy' | 'terms-of-service';

/** Version identifiers for the plain-language legal pages shipped in V1. */
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocumentSlug, string> = {
	'privacy-policy': '2026-09-01',
	'terms-of-service': '2026-09-01'
};

export const LEGAL_DOCUMENT_SLUGS = Object.keys(LEGAL_DOCUMENT_VERSIONS) as LegalDocumentSlug[];
