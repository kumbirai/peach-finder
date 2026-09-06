import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { writeAudit } from '../../../shared/audit';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import {
	newId,
	type ProviderProfileId,
	type UserId,
	type VerificationCaseId
} from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { ensureBadgeStateFromLegacy } from './identity-change-subscription';
import {
	buildAdminIdempotencyKey,
	readProcessedAdminAction,
	recordProcessedAdminAction
} from './processed-admin-action';
import { findPendingVerificationCase } from './identity-queue-queries';
import { badgeState, verificationCases } from './schema';

export type VerificationDecisionResult = {
	caseId: VerificationCaseId;
	providerProfileId: ProviderProfileId;
	decision: 'approved' | 'rejected';
};

function validationIssue(path: string, message: string): UseCaseError {
	return { kind: 'validation_failed', issues: [{ path, message }] };
}

async function grantIdentityBadge(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date,
	correlationId: string
): Promise<void> {
	await ensureBadgeStateFromLegacy(tx, providerProfileId, now);
	await tx
		.insert(badgeState)
		.values({
			providerProfileId,
			identityVerified: true,
			identityVerifiedSince: now,
			suppressed: false,
			suppressedReason: null,
			activeThisWeek: false,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: badgeState.providerProfileId,
			set: {
				identityVerified: true,
				identityVerifiedSince: now,
				suppressed: false,
				suppressedReason: null,
				updatedAt: now
			}
		});

	const granted: DomainEvent<
		'BadgeGranted',
		{ providerProfileId: string; badge: string; reason?: string }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'BadgeGranted',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			badge: 'identity_verified',
			reason: 'admin_approve'
		}
	};
	await publish(tx, granted);
}

export async function approveVerification(
	db: Database,
	input: {
		caseId: VerificationCaseId;
		adminId: UserId;
		reason?: string | null;
		idempotencyKey: string | null;
		correlationId: string;
		now: Date;
	}
): Promise<Result<VerificationDecisionResult, UseCaseError>> {
	const pending = await findPendingVerificationCase(db, input.caseId);
	if (!pending) {
		return Err({ kind: 'not_found', resource: 'verification_case' });
	}

	const idempotencyKey = buildAdminIdempotencyKey(
		input.adminId,
		'identity.approve',
		input.caseId,
		input.idempotencyKey
	);

	const existing = await db.transaction(async (tx) => readProcessedAdminAction(tx, idempotencyKey));
	if (existing) {
		return Ok({
			caseId: input.caseId,
			providerProfileId: pending.providerProfileId as ProviderProfileId,
			decision: 'approved'
		});
	}

	await db.transaction(async (tx) => {
		const duplicate = await readProcessedAdminAction(tx, idempotencyKey);
		if (duplicate) return;

		await tx
			.update(verificationCases)
			.set({
				status: 'approved',
				decidedAt: input.now,
				decidedBy: input.adminId,
				decisionReason: input.reason ?? null
			})
			.where(eq(verificationCases.id, input.caseId));

		await grantIdentityBadge(
			tx,
			pending.providerProfileId as ProviderProfileId,
			input.now,
			input.correlationId
		);

		await writeAudit(tx, {
			actorId: input.adminId,
			actorRole: 'admin',
			action: 'identity.approve',
			targetType: 'verification_case',
			targetId: input.caseId,
			reason: input.reason ?? null,
			correlationId: input.correlationId
		});

		const decided: DomainEvent<
			'VerificationDecided',
			{ verificationCaseId: string; providerProfileId: string; decision: string }
		> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'VerificationDecided',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: {
				verificationCaseId: input.caseId,
				providerProfileId: pending.providerProfileId,
				decision: 'approved'
			}
		};
		await publish(tx, decided);

		await recordProcessedAdminAction(tx, idempotencyKey, input.caseId, input.now);
	});

	return Ok({
		caseId: input.caseId,
		providerProfileId: pending.providerProfileId as ProviderProfileId,
		decision: 'approved'
	});
}

export async function rejectVerification(
	db: Database,
	input: {
		caseId: VerificationCaseId;
		adminId: UserId;
		reason: string;
		idempotencyKey: string | null;
		correlationId: string;
		now: Date;
	}
): Promise<Result<VerificationDecisionResult, UseCaseError>> {
	const trimmed = input.reason.trim();
	if (!trimmed) {
		return Err(validationIssue('reason', 'Enter a rejection reason shown to the provider.'));
	}

	const pending = await findPendingVerificationCase(db, input.caseId);
	if (!pending) {
		return Err({ kind: 'not_found', resource: 'verification_case' });
	}

	const idempotencyKey = buildAdminIdempotencyKey(
		input.adminId,
		'identity.reject',
		input.caseId,
		input.idempotencyKey
	);

	const existing = await db.transaction(async (tx) => readProcessedAdminAction(tx, idempotencyKey));
	if (existing) {
		return Ok({
			caseId: input.caseId,
			providerProfileId: pending.providerProfileId as ProviderProfileId,
			decision: 'rejected'
		});
	}

	await db.transaction(async (tx) => {
		const duplicate = await readProcessedAdminAction(tx, idempotencyKey);
		if (duplicate) return;

		await tx
			.update(verificationCases)
			.set({
				status: 'rejected',
				decidedAt: input.now,
				decidedBy: input.adminId,
				decisionReason: trimmed
			})
			.where(eq(verificationCases.id, input.caseId));

		await writeAudit(tx, {
			actorId: input.adminId,
			actorRole: 'admin',
			action: 'identity.reject',
			targetType: 'verification_case',
			targetId: input.caseId,
			reason: trimmed,
			correlationId: input.correlationId
		});

		const decided: DomainEvent<
			'VerificationDecided',
			{ verificationCaseId: string; providerProfileId: string; decision: string }
		> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'VerificationDecided',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: {
				verificationCaseId: input.caseId,
				providerProfileId: pending.providerProfileId,
				decision: 'rejected'
			}
		};
		await publish(tx, decided);

		await recordProcessedAdminAction(tx, idempotencyKey, input.caseId, input.now);
	});

	return Ok({
		caseId: input.caseId,
		providerProfileId: pending.providerProfileId as ProviderProfileId,
		decision: 'rejected'
	});
}

export async function verificationCaseReferencesPhoto(
	db: Database,
	photoId: string
): Promise<boolean> {
	const rows = await db
		.select({ docPhotoIds: verificationCases.docPhotoIds })
		.from(verificationCases)
		.where(eq(verificationCases.status, 'pending'));
	return rows.some((row) => (row.docPhotoIds ?? []).includes(photoId));
}
