import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { newId, type UserId } from '../../../shared/ids';
import {
	LEGAL_DOCUMENT_SLUGS,
	LEGAL_DOCUMENT_VERSIONS,
	type LegalDocumentSlug
} from '../domain/legal-documents';
import { termsAcceptance } from './schema';

export type TermsAcceptanceRecord = {
	documentSlug: LegalDocumentSlug;
	documentVersion: string;
	acceptedAt: string;
};

export async function recordTermsAcceptance(
	tx: Transaction,
	userId: UserId,
	acceptedAt: Date
): Promise<void> {
	for (const slug of LEGAL_DOCUMENT_SLUGS) {
		await tx.insert(termsAcceptance).values({
			id: newId(),
			userId,
			documentSlug: slug,
			documentVersion: LEGAL_DOCUMENT_VERSIONS[slug],
			acceptedAt
		});
	}
}

export async function listTermsAcceptanceForUser(
	db: Database,
	userId: UserId
): Promise<TermsAcceptanceRecord[]> {
	const rows = await db
		.select({
			documentSlug: termsAcceptance.documentSlug,
			documentVersion: termsAcceptance.documentVersion,
			acceptedAt: termsAcceptance.acceptedAt
		})
		.from(termsAcceptance)
		.where(eq(termsAcceptance.userId, userId));

	return rows.map((row) => ({
		documentSlug: row.documentSlug as LegalDocumentSlug,
		documentVersion: row.documentVersion,
		acceptedAt: row.acceptedAt.toISOString()
	}));
}
