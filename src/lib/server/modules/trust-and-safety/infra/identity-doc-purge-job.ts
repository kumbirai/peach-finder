import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { Database } from '../../../db';
import { deletePhotos } from '../../media-processing';
import type { PhotoId } from '../../../shared/ids';
import { log } from '../../../shared/logger';
import { pingHealthcheck } from '../../../shared/healthcheck';
import { IDENTITY_DOC_RETENTION_MS } from '../domain/identity-doc-retention';
import { verificationCases } from './schema';

export type IdentityDocPurgeJobResult = {
	casesPurged: number;
	photosRemoved: number;
};

export async function runIdentityDocPurgeJob(
	db: Database,
	now: Date,
	correlationId: string
): Promise<IdentityDocPurgeJobResult> {
	const startedAt = Date.now();
	const cutoff = new Date(now.getTime() - IDENTITY_DOC_RETENTION_MS);

	const due = await db
		.select({
			id: verificationCases.id,
			docPhotoIds: verificationCases.docPhotoIds
		})
		.from(verificationCases)
		.where(
			and(
				isNotNull(verificationCases.decidedAt),
				isNull(verificationCases.docsPurgedAt),
				lte(verificationCases.decidedAt, cutoff)
			)
		);

	let photosRemoved = 0;
	let casesPurged = 0;
	for (const row of due) {
		const photoIds = (row.docPhotoIds ?? []) as PhotoId[];
		if (photoIds.length > 0) {
			const removed = await deletePhotos(db, photoIds, correlationId);
			photosRemoved += removed;
		}

		const updated = await db
			.update(verificationCases)
			.set({ docsPurgedAt: now })
			.where(and(eq(verificationCases.id, row.id), isNull(verificationCases.docsPurgedAt)))
			.returning({ id: verificationCases.id });

		if (updated.length > 0) casesPurged += 1;
	}

	const result = { casesPurged, photosRemoved };
	log('info', 'identity-doc purge completed', {
		casesPurged: result.casesPurged,
		photosRemoved: result.photosRemoved,
		durationMs: Date.now() - startedAt,
		correlationId
	});
	await pingHealthcheck('HEALTHCHECK_IDENTITY_DOC_PURGE');
	return result;
}
