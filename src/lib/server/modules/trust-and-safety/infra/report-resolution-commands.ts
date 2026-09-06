import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { writeAudit } from '../../../shared/audit';
import type { ModerationActionId, ProviderProfileId, ReportId, UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getOwnedProfileIdDb, getProfileOwnerIdDb } from '../../provider-profile';
import type { ModerationActionKind } from '../domain/moderation-actions';
import {
	removePhoto,
	removeReview,
	reinstateAccount,
	revokeBadge,
	suspendAccount,
	unpublishProfile
} from './moderation-commands';
import {
	buildAdminIdempotencyKey,
	readProcessedAdminAction,
	recordProcessedAdminAction
} from './processed-admin-action';
import { findOpenReport } from './reports-queue-queries';
import { publishReportResolved } from './report-events';
import { reports } from './schema';

export type { ModerationActionKind } from '../domain/moderation-actions';

function validationIssue(path: string, message: string): UseCaseError {
	return { kind: 'validation_failed', issues: [{ path, message }] };
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

async function resolveUserForReport(
	db: Database,
	open: typeof reports.$inferSelect
): Promise<Result<UserId, UseCaseError>> {
	const profileResult = await resolveProviderProfileForReport(db, open);
	if (!profileResult.ok) return profileResult;
	const ownerId = await getProfileOwnerIdDb(db, profileResult.value);
	if (!ownerId) return Err({ kind: 'not_found', resource: 'user' });
	return Ok(ownerId);
}

async function runModerationForReport(
	db: Database,
	input: {
		reportId: ReportId;
		adminId: UserId;
		action: ModerationActionKind;
		reason: string;
		open: typeof reports.$inferSelect;
		idempotencyKey: string | null;
		correlationId: string;
		now: Date;
	}
): Promise<Result<ModerationActionId, UseCaseError>> {
	const base = {
		adminId: input.adminId,
		reason: input.reason,
		reportId: input.reportId,
		idempotencyKey: input.idempotencyKey,
		correlationId: input.correlationId,
		now: input.now
	};

	switch (input.action) {
		case 'remove_photo':
			if (input.open.targetType !== 'photo') {
				return Err(validationIssue('action', 'Remove photo only applies to photo reports.'));
			}
			return mapModerationResult(
				await removePhoto(db, { ...base, photoId: input.open.targetId as never })
			);
		case 'remove_review': {
			if (input.open.targetType !== 'review') {
				return Err(validationIssue('action', 'Remove review only applies to review reports.'));
			}
			const metadata = input.open.metadata as { part?: string };
			const reviewInput = {
				...base,
				reviewId: input.open.targetId as never
			};
			if (metadata.part === 'reply') {
				return mapModerationResult(await removeReview(db, { ...reviewInput, part: 'reply' }));
			}
			return mapModerationResult(await removeReview(db, reviewInput));
		}
		case 'unpublish': {
			const profileResult = await resolveProviderProfileForReport(db, input.open);
			if (!profileResult.ok) return profileResult;
			return mapModerationResult(
				await unpublishProfile(db, {
					...base,
					providerProfileId: profileResult.value
				})
			);
		}
		case 'suspend': {
			const userResult = await resolveUserForReport(db, input.open);
			if (!userResult.ok) return userResult;
			return mapModerationResult(await suspendAccount(db, { ...base, userId: userResult.value }));
		}
		case 'revoke_badge': {
			const profileResult = await resolveProviderProfileForReport(db, input.open);
			if (!profileResult.ok) return profileResult;
			return mapModerationResult(
				await revokeBadge(db, {
					...base,
					providerProfileId: profileResult.value
				})
			);
		}
		case 'reinstate': {
			const userResult = await resolveUserForReport(db, input.open);
			if (!userResult.ok) return userResult;
			return mapModerationResult(await reinstateAccount(db, { ...base, userId: userResult.value }));
		}
		default:
			return Err(validationIssue('action', 'Unsupported moderation action.'));
	}
}

function mapModerationResult(
	result: Result<{ moderationActionId: ModerationActionId }, UseCaseError>
): Result<ModerationActionId, UseCaseError> {
	if (!result.ok) return result;
	return Ok(result.value.moderationActionId);
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

	const moderationResult = await runModerationForReport(db, {
		reportId: input.reportId,
		adminId: input.adminId,
		action: input.action,
		reason: trimmed,
		open,
		idempotencyKey: input.idempotencyKey,
		correlationId: input.correlationId,
		now: input.now
	});
	if (!moderationResult.ok) return moderationResult;

	await db.transaction(async (tx) => {
		const duplicate = await readProcessedAdminAction(tx, idempotencyKey);
		if (duplicate) return;

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
			metadata: { moderationAction: input.action, moderationActionId: moderationResult.value },
			correlationId: input.correlationId
		});

		await publishReportResolved(tx, {
			reportId: input.reportId,
			resolution: 'acted',
			correlationId: input.correlationId,
			now: input.now
		});

		await recordProcessedAdminAction(tx, idempotencyKey, moderationResult.value, input.now);
	});

	return Ok({ reportId: input.reportId, resolution: 'acted' });
}
