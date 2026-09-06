import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { writeAudit } from '../../../shared/audit';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import {
	newId,
	type ModerationActionId,
	type PhotoId,
	type ProviderProfileId,
	type ReportId,
	type ReviewId,
	type UserId
} from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import {
	applyReinstatement,
	applySuspension
} from '../../identity-and-access/infra/suspension-commands';
import { ensureBadgeStateFromLegacy } from './identity-change-subscription';
import { auditActionForModeration, type ModerationActionKind } from '../domain/moderation-actions';
import {
	buildAdminIdempotencyKey,
	readProcessedAdminAction,
	recordProcessedAdminAction
} from './processed-admin-action';
import { moderationActions, badgeState } from './schema';

export type { ModerationActionKind } from '../domain/moderation-actions';

export type ModerationCommandResult = {
	moderationActionId: ModerationActionId;
	action: ModerationActionKind;
};

function validationIssue(path: string, message: string): UseCaseError {
	return { kind: 'validation_failed', issues: [{ path, message }] };
}

async function publishModerationActionTaken(
	tx: Transaction,
	input: {
		moderationActionId: ModerationActionId;
		targetType: string;
		targetId: string;
		action: ModerationActionKind;
		reason: string;
		metadata?: Record<string, unknown>;
		correlationId: string;
		now: Date;
	}
): Promise<void> {
	const event: DomainEvent<
		'ModerationActionTaken',
		{
			moderationActionId: string;
			targetType: string;
			targetId: string;
			action: string;
			reason?: string;
			metadata?: Record<string, unknown>;
		}
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ModerationActionTaken',
		version: 1,
		occurredAt: asInstant(input.now.toISOString()),
		correlationId: input.correlationId,
		payload: {
			moderationActionId: input.moderationActionId,
			targetType: input.targetType,
			targetId: input.targetId,
			action: input.action,
			reason: input.reason,
			...(input.metadata ? { metadata: input.metadata } : {})
		}
	};
	await publish(tx, event);
}

async function publishBadgeRevoked(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	reason: string,
	correlationId: string,
	now: Date
): Promise<void> {
	const event: DomainEvent<
		'BadgeRevoked',
		{ providerProfileId: string; badge: string; reason?: string }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'BadgeRevoked',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			badge: 'identity_verified',
			reason
		}
	};
	await publish(tx, event);
}

type ModerationBaseInput = {
	adminId: UserId;
	reason: string;
	reportId?: ReportId | null;
	metadata?: Record<string, unknown>;
	idempotencyKey: string | null;
	correlationId: string;
	now: Date;
};

async function executeModerationAction(
	db: Database,
	input: ModerationBaseInput & {
		action: ModerationActionKind;
		targetType: string;
		targetId: string;
	}
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	const trimmed = input.reason.trim();
	if (!trimmed) {
		return Err(validationIssue('reason', 'Enter a reason for this moderation action.'));
	}

	const idempotencyKey = buildAdminIdempotencyKey(
		input.adminId,
		auditActionForModeration(input.action),
		input.targetId,
		input.idempotencyKey
	);

	const existing = await db.transaction(async (tx) => readProcessedAdminAction(tx, idempotencyKey));
	if (existing) {
		return Ok({
			moderationActionId: existing.resultRef as ModerationActionId,
			action: input.action
		});
	}

	const moderationActionId = newId<'ModerationActionId'>();

	await db.transaction(async (tx) => {
		const duplicate = await readProcessedAdminAction(tx, idempotencyKey);
		if (duplicate) return;

		if (input.action === 'suspend') {
			await applySuspension(tx, input.targetId as UserId, input.now);
		}
		if (input.action === 'reinstate') {
			await applyReinstatement(tx, input.targetId as UserId, input.now);
		}
		if (input.action === 'revoke_badge') {
			const providerProfileId = input.targetId as ProviderProfileId;
			await ensureBadgeStateFromLegacy(tx, providerProfileId, input.now);
			await tx
				.update(badgeState)
				.set({
					identityVerified: false,
					identityVerifiedSince: null,
					updatedAt: input.now
				})
				.where(eq(badgeState.providerProfileId, providerProfileId));
			await publishBadgeRevoked(
				tx,
				providerProfileId,
				'admin_revoke',
				input.correlationId,
				input.now
			);
		}

		await tx.insert(moderationActions).values({
			id: moderationActionId,
			adminId: input.adminId,
			action: input.action,
			targetType: input.targetType,
			targetId: input.targetId,
			reason: trimmed,
			reportId: input.reportId ?? null,
			metadata: input.metadata ?? {},
			createdAt: input.now
		});

		await writeAudit(tx, {
			actorId: input.adminId,
			actorRole: 'admin',
			action: auditActionForModeration(input.action),
			targetType: input.targetType,
			targetId: input.targetId,
			reason: trimmed,
			...(input.metadata ? { metadata: input.metadata } : {}),
			correlationId: input.correlationId
		});

		await publishModerationActionTaken(tx, {
			moderationActionId,
			targetType: input.targetType,
			targetId: input.targetId,
			action: input.action,
			reason: trimmed,
			...(input.metadata ? { metadata: input.metadata } : {}),
			correlationId: input.correlationId,
			now: input.now
		});

		await recordProcessedAdminAction(tx, idempotencyKey, moderationActionId, input.now);
	});

	return Ok({ moderationActionId, action: input.action });
}

export async function removePhoto(
	db: Database,
	input: ModerationBaseInput & { photoId: PhotoId }
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	return executeModerationAction(db, {
		...input,
		action: 'remove_photo',
		targetType: 'photo',
		targetId: input.photoId
	});
}

export async function removeReview(
	db: Database,
	input: ModerationBaseInput & {
		reviewId: ReviewId;
		part?: 'reply';
	}
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	const { reviewId, part, ...base } = input;
	return executeModerationAction(db, {
		...base,
		action: 'remove_review',
		targetType: 'review',
		targetId: reviewId,
		...(part === 'reply' ? { metadata: { part: 'reply' } } : {})
	});
}

export async function unpublishProfile(
	db: Database,
	input: ModerationBaseInput & { providerProfileId: ProviderProfileId }
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	return executeModerationAction(db, {
		...input,
		action: 'unpublish',
		targetType: 'provider_profile',
		targetId: input.providerProfileId
	});
}

export async function suspendAccount(
	db: Database,
	input: ModerationBaseInput & { userId: UserId }
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	return executeModerationAction(db, {
		...input,
		action: 'suspend',
		targetType: 'user',
		targetId: input.userId
	});
}

export async function reinstateAccount(
	db: Database,
	input: ModerationBaseInput & { userId: UserId }
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	return executeModerationAction(db, {
		...input,
		action: 'reinstate',
		targetType: 'user',
		targetId: input.userId
	});
}

export async function revokeBadge(
	db: Database,
	input: ModerationBaseInput & { providerProfileId: ProviderProfileId }
): Promise<Result<ModerationCommandResult, UseCaseError>> {
	return executeModerationAction(db, {
		...input,
		action: 'revoke_badge',
		targetType: 'provider_profile',
		targetId: input.providerProfileId
	});
}
