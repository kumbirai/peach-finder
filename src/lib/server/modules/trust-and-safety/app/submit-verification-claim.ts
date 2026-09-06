import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { validateIdentityDocPhotos } from '../../media-processing';
import {
	newId,
	type PhotoId,
	type ProviderProfileId,
	type UserId,
	type VerificationCaseId
} from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import type { VerificationOwnerStatus } from '../domain/verification-status';
import { getOwnVerificationStatus } from '../infra/verification-status-read';
import { verificationCases } from '../infra/schema';

export type VerificationCaseDto = {
	caseId: VerificationCaseId;
	providerProfileId: ProviderProfileId;
	status: 'pending';
	submittedAt: string;
	docPhotoIds: string[];
};

function validationIssue(path: string, message: string): UseCaseError {
	return { kind: 'validation_failed', issues: [{ path, message }] };
}

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: string }).code === '23505'
	);
}

function guardSubmission(
	status: VerificationOwnerStatus,
	mode: 'submit' | 'resubmit'
): Result<void, UseCaseError> | null {
	if (status === 'approved') {
		return Err({ kind: 'conflict', reason: 'Your identity is already verified.' });
	}
	if (mode === 'resubmit' && status === 'never_submitted') {
		return Err({
			kind: 'precondition_failed',
			reason: 'You need a rejected submission before you can resubmit.'
		});
	}
	return null;
}

async function findOpenVerificationCase(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<typeof verificationCases.$inferSelect | null> {
	const rows = await db
		.select()
		.from(verificationCases)
		.where(
			and(
				eq(verificationCases.providerProfileId, providerProfileId),
				eq(verificationCases.status, 'pending')
			)
		)
		.limit(1);
	return rows[0] ?? null;
}

async function insertPendingCase(
	db: Database,
	input: {
		providerProfileId: ProviderProfileId;
		docPhotoIds: PhotoId[];
		now: Date;
	}
): Promise<VerificationCaseDto> {
	const caseId = newId<'VerificationCaseId'>();
	await db.insert(verificationCases).values({
		id: caseId,
		providerProfileId: input.providerProfileId,
		status: 'pending',
		docPhotoIds: input.docPhotoIds,
		submittedAt: input.now
	});

	return {
		caseId,
		providerProfileId: input.providerProfileId,
		status: 'pending',
		submittedAt: input.now.toISOString(),
		docPhotoIds: input.docPhotoIds
	};
}

export async function submitVerificationClaim(
	db: Database,
	input: {
		ownerId: UserId;
		providerProfileId: ProviderProfileId;
		docPhotoIds: string[];
		now: Date;
	}
): Promise<Result<VerificationCaseDto, UseCaseError>> {
	if (!input.docPhotoIds?.length) {
		return Err(
			validationIssue('docPhotoIds', 'Upload both your government ID photo and a selfie.')
		);
	}

	let photoIds: PhotoId[];
	try {
		photoIds = input.docPhotoIds.map((id) => id as PhotoId);
	} catch {
		return Err(validationIssue('docPhotoIds', 'Each photo id must be a valid UUID.'));
	}

	const validated = await validateIdentityDocPhotos(db, input.ownerId, photoIds);
	if (!validated.ok) return validated;

	const ownerStatus = await getOwnVerificationStatus(db, input.providerProfileId);
	const blocked = guardSubmission(ownerStatus.status, 'submit');
	if (blocked) return blocked;

	const open = await findOpenVerificationCase(db, input.providerProfileId);
	if (open) {
		return Err({ kind: 'conflict', reason: 'VERIFICATION_ALREADY_PENDING' });
	}

	try {
		const created = await insertPendingCase(db, {
			providerProfileId: input.providerProfileId,
			docPhotoIds: photoIds,
			now: input.now
		});
		return Ok(created);
	} catch (error) {
		if (isUniqueViolation(error)) {
			return Err({ kind: 'conflict', reason: 'VERIFICATION_ALREADY_PENDING' });
		}
		throw error;
	}
}

export async function resubmitVerificationClaim(
	db: Database,
	input: {
		ownerId: UserId;
		providerProfileId: ProviderProfileId;
		docPhotoIds: string[];
		now: Date;
	}
): Promise<Result<VerificationCaseDto, UseCaseError>> {
	if (!input.docPhotoIds?.length) {
		return Err(
			validationIssue('docPhotoIds', 'Upload both your government ID photo and a selfie.')
		);
	}

	let photoIds: PhotoId[];
	try {
		photoIds = input.docPhotoIds.map((id) => id as PhotoId);
	} catch {
		return Err(validationIssue('docPhotoIds', 'Each photo id must be a valid UUID.'));
	}

	const validated = await validateIdentityDocPhotos(db, input.ownerId, photoIds);
	if (!validated.ok) return validated;

	const ownerStatus = await getOwnVerificationStatus(db, input.providerProfileId);
	const blocked = guardSubmission(ownerStatus.status, 'resubmit');
	if (blocked) return blocked;

	const open = await findOpenVerificationCase(db, input.providerProfileId);
	if (open) {
		return Err({ kind: 'conflict', reason: 'VERIFICATION_ALREADY_PENDING' });
	}

	try {
		const created = await insertPendingCase(db, {
			providerProfileId: input.providerProfileId,
			docPhotoIds: photoIds,
			now: input.now
		});
		return Ok(created);
	} catch (error) {
		if (isUniqueViolation(error)) {
			return Err({ kind: 'conflict', reason: 'VERIFICATION_ALREADY_PENDING' });
		}
		throw error;
	}
}
