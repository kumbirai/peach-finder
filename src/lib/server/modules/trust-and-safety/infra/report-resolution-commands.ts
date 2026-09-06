import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { writeAudit } from '../../../shared/audit';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import {
	newId,
	type ModerationActionId,
	type ProviderProfileId,
	type ReportId,
	type UserId
} from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { unpublishProfileForOwner, getOwnedProfileIdDb } from '../../provider-profile';
import { getProfileOwnerIdDb } from '../../provider-profile';
import {
	buildAdminIdempotencyKey,
	readProcessedAdminAction,
	recordProcessedAdminAction
} from './processed-admin-action';
import { findOpenReport } from './reports-queue-queries';
import { moderationActions, reports } from './schema';

export type ModerationActionKind = 'unpublish';

function validationIssue(path: string, message: string): UseCaseError {
	return { kind: 'validation_failed', issues: [{ path, message }] };
}

async function publishModerationActionTaken(
	tx: Transaction,
	input: {
		moderationActionId: ModerationActionId;
		targetType: string;
		targetId: string;
		action: string;
		reason: string;
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
			reason: input.reason
		}
	};
	await publish(tx, event);
}

async function publishReportResolved(
	tx: Transaction,
	input: {
		reportId: ReportId;
		resolution: 'dismissed' | 'acted';
		correlationId: string;
		now: Date;
	}
): Promise<void> {
	const event: DomainEvent<'ReportResolved', { reportId: string; resolution: string }> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ReportResolved',
		version: 1,
		occurredAt: asInstant(input.now.toISOString()),
		correlationId: input.correlationId,
		payload: {
			reportId: input.reportId,
			resolution: input.resolution
		}
	};
	await publish(tx, event);
}

export type ReportResolutionResult = {
	reportId: ReportId;
	resolution: 'dismissed' | 'acted';
};

export async function dismissReport(
	db: Database,
	input: {
		reportId: ReportId;
		adminId: UserId;
		note: string;
		idempotencyKey: string | null;
		correlationId: string;
		now: Date;
	}
): Promise<Result<ReportResolutionResult, UseCaseError>> {
	const trimmed = input.note.trim();
	if (!trimmed) {
		return Err(validationIssue('note', 'Enter a resolution note before dismissing.'));
	}

	const idempotencyKey = buildAdminIdempotencyKey(
		input.adminId,
		'report.dismiss',
		input.reportId,
		input.idempotencyKey
	);

	const existing = await db.transaction(async (tx) => readProcessedAdminAction(tx, idempotencyKey));
	if (existing) {
		return Ok({ reportId: input.reportId, resolution: 'dismissed' });
	}

	const open = await findOpenReport(db, input.reportId);
	if (!open) {
		return Err({ kind: 'not_found', resource: 'report' });
	}

	await db.transaction(async (tx) => {
		const duplicate = await readProcessedAdminAction(tx, idempotencyKey);
		if (duplicate) return;

		await tx
			.update(reports)
			.set({
				status: 'dismissed',
				resolvedAt: input.now,
				resolvedBy: input.adminId,
				resolutionNote: trimmed
			})
			.where(eq(reports.id, input.reportId));

		await writeAudit(tx, {
			actorId: input.adminId,
			actorRole: 'admin',
			action: 'report.dismiss',
			targetType: 'report',
			targetId: input.reportId,
			reason: trimmed,
			correlationId: input.correlationId
		});

		await publishReportResolved(tx, {
			reportId: input.reportId,
			resolution: 'dismissed',
			correlationId: input.correlationId,
			now: input.now
		});

		await recordProcessedAdminAction(tx, idempotencyKey, input.reportId, input.now);
	});

	return Ok({ reportId: input.reportId, resolution: 'dismissed' });
}

async function resolveProviderProfileForReport(
	db: Database,
	open: typeof reports.$inferSelect
): Promise<Result<ProviderProfileId, UseCaseError>> {
	if (open.targetType === 'profile') {
		return Ok(open.targetId as ProviderProfileId);
	}
	if (open.targetType === 'review') {
		const { reviews } = await import('../../provider-reviews/infra/schema');
		const rows = await db
			.select({ providerProfileId: reviews.providerProfileId })
			.from(reviews)
			.where(eq(reviews.id, open.targetId))
			.limit(1);
		const profileId = rows[0]?.providerProfileId;
		if (!profileId) return Err({ kind: 'not_found', resource: 'provider_profile' });
		return Ok(profileId as ProviderProfileId);
	}
	if (open.targetType === 'photo') {
		const { getPhotoOwner } = await import('../../media-processing');
		const ownerId = await getPhotoOwner(db, open.targetId as never);
		if (!ownerId) return Err({ kind: 'not_found', resource: 'photo' });
		const profileId = await getOwnedProfileIdDb(db, ownerId);
		if (!profileId) return Err({ kind: 'not_found', resource: 'provider_profile' });
		return Ok(profileId);
	}
	if (open.targetType === 'thread') {
		const { getThreadForReport } = await import('../../direct-messaging');
		const thread = await getThreadForReport(db, open.targetId as never);
		if (!thread) return Err({ kind: 'not_found', resource: 'thread' });
		const reportedUserId =
			thread.participantIds.find((id) => id !== open.reporterId) ?? thread.participantIds[0]!;
		const profileId = await getOwnedProfileIdDb(db, reportedUserId);
		if (!profileId) return Err({ kind: 'not_found', resource: 'provider_profile' });
		return Ok(profileId);
	}
	return Err({
		kind: 'validation_failed',
		issues: [{ path: 'action', message: 'Unsupported target.' }]
	});
}

export async function actOnReport(
	db: Database,
	input: {
		reportId: ReportId;
		adminId: UserId;
		action: ModerationActionKind;
		reason: string;
		idempotencyKey: string | null;
		correlationId: string;
		now: Date;
	}
): Promise<Result<ReportResolutionResult, UseCaseError>> {
	const trimmed = input.reason.trim();
	if (!trimmed) {
		return Err(validationIssue('reason', 'Enter a reason for this moderation action.'));
	}

	if (input.action !== 'unpublish') {
		return Err(validationIssue('action', 'Only unpublish is available in this release.'));
	}

	const idempotencyKey = buildAdminIdempotencyKey(
		input.adminId,
		'report.act',
		input.reportId,
		input.idempotencyKey
	);

	const existing = await db.transaction(async (tx) => readProcessedAdminAction(tx, idempotencyKey));
	if (existing) {
		return Ok({ reportId: input.reportId, resolution: 'acted' });
	}

	const open = await findOpenReport(db, input.reportId);
	if (!open) {
		return Err({ kind: 'not_found', resource: 'report' });
	}

	const profileResult = await resolveProviderProfileForReport(db, open);
	if (!profileResult.ok) return profileResult;
	const providerProfileId = profileResult.value;

	const moderationActionId = newId<'ModerationActionId'>();

	await db.transaction(async (tx) => {
		const duplicate = await readProcessedAdminAction(tx, idempotencyKey);
		if (duplicate) return;

		const ownerId = await getProfileOwnerIdDb(tx, providerProfileId);
		if (!ownerId) throw new Error('provider owner missing');

		await unpublishProfileForOwner(tx, ownerId, 'admin', input.correlationId, input.now);

		await tx.insert(moderationActions).values({
			id: moderationActionId,
			adminId: input.adminId,
			action: 'unpublish',
			targetType: 'provider_profile',
			targetId: providerProfileId,
			reason: trimmed,
			reportId: input.reportId,
			createdAt: input.now
		});

		await tx
			.update(reports)
			.set({
				status: 'acted',
				resolvedAt: input.now,
				resolvedBy: input.adminId,
				resolutionNote: trimmed
			})
			.where(eq(reports.id, input.reportId));

		await writeAudit(tx, {
			actorId: input.adminId,
			actorRole: 'admin',
			action: 'report.act',
			targetType: 'report',
			targetId: input.reportId,
			reason: trimmed,
			metadata: { moderationAction: 'unpublish', providerProfileId },
			correlationId: input.correlationId
		});

		await publishReportResolved(tx, {
			reportId: input.reportId,
			resolution: 'acted',
			correlationId: input.correlationId,
			now: input.now
		});

		await publishModerationActionTaken(tx, {
			moderationActionId,
			targetType: 'provider_profile',
			targetId: providerProfileId,
			action: 'unpublish',
			reason: trimmed,
			correlationId: input.correlationId,
			now: input.now
		});

		await recordProcessedAdminAction(tx, idempotencyKey, moderationActionId, input.now);
	});

	return Ok({ reportId: input.reportId, resolution: 'acted' });
}
