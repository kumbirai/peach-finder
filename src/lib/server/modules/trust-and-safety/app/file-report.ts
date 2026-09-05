import type { Database } from '../../../db';
import { publish } from '../../../shared/outbox';
import { newId, asId, type ReportId, type UserId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { anonymousAuth } from '../../../shared/auth-context';
import { isThreadParticipant } from '../../direct-messaging';
import { getPublicProfile } from '../../provider-profile';
import {
	isReportReason,
	isReportTargetType,
	type ReportReason,
	type ReportTargetType
} from '../domain/report-taxonomy';
import { reports } from '../infra/schema';

function validationIssue(path: string, message: string): UseCaseError {
	return {
		kind: 'validation_failed',
		issues: [{ path, message }]
	};
}

export async function fileReport(
	db: Database,
	input: {
		reporterId: UserId;
		targetType: string;
		targetId: string;
		reason: string;
		freeText?: string | null;
		now: Date;
		correlationId: string;
	}
): Promise<Result<{ reportId: ReportId }, UseCaseError>> {
	if (!isReportTargetType(input.targetType)) {
		return Err(validationIssue('targetType', 'Choose a valid report target.'));
	}
	if (!isReportReason(input.reason)) {
		return Err(validationIssue('reason', 'Choose a valid reason.'));
	}

	const targetType = input.targetType as ReportTargetType;
	const reason = input.reason as ReportReason;
	const targetId = input.targetId;
	if (!targetId) {
		return Err(validationIssue('targetId', 'Choose what to report.'));
	}

	if (input.freeText && input.freeText.length > 2000) {
		return Err(validationIssue('freeText', 'Keep details under 2000 characters.'));
	}

	if (targetType === 'thread') {
		const allowed = await isThreadParticipant(db, targetId, input.reporterId);
		if (!allowed) {
			return Err({ kind: 'not_found', resource: 'thread' });
		}
	}

	if (targetType === 'profile') {
		const profile = await getPublicProfile(
			db,
			asId<'ProviderProfileId'>(targetId),
			anonymousAuth('127.0.0.1')
		);
		if (!profile.ok) {
			return Err({ kind: 'not_found', resource: 'provider_profile' });
		}
	}

	const reportId = newId<'ReportId'>();

	await db.transaction(async (tx) => {
		await tx.insert(reports).values({
			id: reportId,
			reporterId: input.reporterId,
			targetType,
			targetId,
			reason,
			freeText: input.freeText ?? null,
			status: 'open',
			createdAt: input.now
		});

		const event: DomainEvent<
			'ReportFiled',
			{ reportId: string; reporterId: string; targetType: string; targetId: string }
		> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'ReportFiled',
			version: 1,
			occurredAt: asInstant(input.now.toISOString()),
			correlationId: input.correlationId,
			payload: {
				reportId,
				reporterId: input.reporterId,
				targetType,
				targetId
			}
		};
		await publish(tx, event);
	});

	return Ok({ reportId });
}
