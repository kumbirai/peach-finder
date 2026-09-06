import { and, asc, eq, ne } from 'drizzle-orm';
import type { Database } from '../../../db';
import { anonymousAuth } from '../../../shared/auth-context';
import { getDisplayIdentity } from '../../identity-and-access';
import { listThreadMessagesForReport } from '../../direct-messaging';
import { getPhotoOwner } from '../../media-processing';
import {
	getProfileOwnerDisplayName,
	getOwnedProfileIdDb,
	getPublicProfile
} from '../../provider-profile';
import type { PublicProfile } from '../../provider-profile/infra/serializers';
import { reviews } from '../../provider-reviews/infra/schema';
import type { ProviderProfileId, ReportId, UserId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import {
	REPORT_REASON_LABELS,
	type ReportReason,
	type ReportTargetType
} from '../domain/report-taxonomy';
import { formatQueueAge, isQueueAgeOverdue, queueAgeHours } from '../domain/queue-age';
import { moderationActions, reports } from './schema';

export type ReportHistoryItem = {
	reportId: ReportId;
	reason: ReportReason;
	reasonLabel: string;
	status: 'open' | 'dismissed' | 'acted';
	createdAt: string;
};

export type ThreadMessageContext = {
	senderDisplayName: string;
	body: string;
	sentAt: string;
};

export type ReviewReportContext = {
	rating: number;
	body: string | null;
	replyBody: string | null;
	providerDisplayName: string;
};

export type PhotoReportContext = {
	photoId: string;
	ownerDisplayName: string;
};

export type ReportQueueItem = {
	reportId: ReportId;
	reporterId: UserId;
	reporterDisplayName: string;
	reportedPartyDisplayName: string;
	targetType: ReportTargetType;
	targetId: string;
	targetLabel: string;
	reason: ReportReason;
	reasonLabel: string;
	freeText: string | null;
	createdAt: string;
	queueAgeLabel: string;
	overdue: boolean;
	historySummary: string;
	priorReports: ReportHistoryItem[];
	threadMessages?: ThreadMessageContext[];
	profile?: PublicProfile;
	review?: ReviewReportContext;
	photo?: PhotoReportContext;
};

export type ReportsQueueStats = {
	openCount: number;
	avgAgeHours: number | null;
	maxAgeHours: number | null;
};

function historySummary(prior: ReportHistoryItem[]): string {
	if (prior.length === 0) return 'No prior reports';
	const dismissed = prior.filter((item) => item.status === 'dismissed').length;
	const acted = prior.filter((item) => item.status === 'acted').length;
	const parts: string[] = [];
	if (dismissed > 0) {
		parts.push(`${dismissed} prior report${dismissed === 1 ? '' : 's'}, dismissed`);
	}
	if (acted > 0) {
		parts.push(`${acted} prior report${acted === 1 ? '' : 's'}, acted on`);
	}
	return parts.join('; ') || 'No prior reports';
}

async function loadPriorReports(
	db: Database,
	targetType: string,
	targetId: string,
	currentReportId: string
): Promise<ReportHistoryItem[]> {
	const rows = await db
		.select()
		.from(reports)
		.where(
			and(
				eq(reports.targetType, targetType),
				eq(reports.targetId, targetId),
				ne(reports.id, currentReportId)
			)
		)
		.orderBy(asc(reports.createdAt));

	return rows.map((row) => ({
		reportId: row.id as ReportId,
		reason: row.reason as ReportReason,
		reasonLabel: REPORT_REASON_LABELS[row.reason as ReportReason],
		status: row.status as 'open' | 'dismissed' | 'acted',
		createdAt: row.createdAt.toISOString()
	}));
}

async function resolveReportedParty(
	db: Database,
	targetType: ReportTargetType,
	targetId: string,
	reporterId: UserId
): Promise<{ displayName: string; providerProfileId?: ProviderProfileId }> {
	switch (targetType) {
		case 'profile': {
			const name = await getProfileOwnerDisplayName(db, asId<'ProviderProfileId'>(targetId));
			return { displayName: name, providerProfileId: asId<'ProviderProfileId'>(targetId) };
		}
		case 'thread': {
			const { getThreadForReport } = await import('../../direct-messaging');
			const thread = await getThreadForReport(db, asId<'ThreadId'>(targetId));
			if (!thread) return { displayName: 'Unknown party' };
			const otherId =
				thread.participantIds.find((id) => id !== reporterId) ?? thread.participantIds[0]!;
			const identity = await getDisplayIdentity(db, otherId);
			return { displayName: identity.displayName };
		}
		case 'review': {
			const reviewRows = await db
				.select({ providerProfileId: reviews.providerProfileId })
				.from(reviews)
				.where(eq(reviews.id, targetId))
				.limit(1);
			const profileId = reviewRows[0]?.providerProfileId;
			if (!profileId) return { displayName: 'Unknown provider' };
			return {
				displayName: await getProfileOwnerDisplayName(db, asId<'ProviderProfileId'>(profileId)),
				providerProfileId: asId<'ProviderProfileId'>(profileId)
			};
		}
		case 'photo': {
			const ownerId = await getPhotoOwner(db, asId<'PhotoId'>(targetId));
			if (!ownerId) return { displayName: 'Unknown owner' };
			const identity = await getDisplayIdentity(db, ownerId);
			const profileId = await getOwnedProfileIdDb(db, ownerId);
			if (profileId) {
				return { displayName: identity.displayName, providerProfileId: profileId };
			}
			return { displayName: identity.displayName };
		}
		default:
			return { displayName: 'Unknown party' };
	}
}

function targetLabel(targetType: ReportTargetType, reportedPartyDisplayName: string): string {
	switch (targetType) {
		case 'profile':
			return `${reportedPartyDisplayName}'s profile`;
		case 'thread':
			return 'a message thread';
		case 'review':
			return `a review on ${reportedPartyDisplayName}'s profile`;
		case 'photo':
			return `a photo on ${reportedPartyDisplayName}'s profile`;
		default:
			return 'unknown target';
	}
}

async function loadContentInContext(
	db: Database,
	row: typeof reports.$inferSelect
): Promise<{
	threadMessages?: ThreadMessageContext[];
	profile?: PublicProfile;
	review?: ReviewReportContext;
	photo?: PhotoReportContext;
}> {
	const targetType = row.targetType as ReportTargetType;
	const reportId = row.id as ReportId;

	if (targetType === 'thread') {
		const messages = await listThreadMessagesForReport(
			db,
			asId<'ThreadId'>(row.targetId),
			reportId
		);
		if (messages.ok) {
			return {
				threadMessages: messages.value.map((message) => ({
					senderDisplayName: message.senderDisplayName,
					body: message.body,
					sentAt: message.sentAt
				}))
			};
		}
		return {};
	}

	if (targetType === 'profile') {
		const profile = await getPublicProfile(
			db,
			asId<'ProviderProfileId'>(row.targetId),
			anonymousAuth('127.0.0.1'),
			{ requirePublished: false }
		);
		if (profile.ok) return { profile: profile.value };
		return {};
	}

	if (targetType === 'review') {
		const reviewRows = await db.select().from(reviews).where(eq(reviews.id, row.targetId)).limit(1);
		const review = reviewRows[0];
		if (!review) return {};
		return {
			review: {
				rating: review.rating,
				body: review.body,
				replyBody: review.replyBody,
				providerDisplayName: await getProfileOwnerDisplayName(
					db,
					asId<'ProviderProfileId'>(review.providerProfileId)
				)
			}
		};
	}

	if (targetType === 'photo') {
		const ownerId = await getPhotoOwner(db, asId<'PhotoId'>(row.targetId));
		if (!ownerId) return {};
		const identity = await getDisplayIdentity(db, ownerId);
		return {
			photo: {
				photoId: row.targetId,
				ownerDisplayName: identity.displayName
			}
		};
	}

	return {};
}

async function mapReportRow(
	db: Database,
	row: typeof reports.$inferSelect,
	now: Date
): Promise<ReportQueueItem> {
	const reporterId = row.reporterId as UserId;
	const reporter = await getDisplayIdentity(db, reporterId);
	const targetType = row.targetType as ReportTargetType;
	const reported = await resolveReportedParty(db, targetType, row.targetId, reporterId);
	const priorReports = await loadPriorReports(db, row.targetType, row.targetId, row.id);
	const content = await loadContentInContext(db, row);
	const reportedPartyDisplayName = reported.displayName;

	return {
		reportId: row.id as ReportId,
		reporterId,
		reporterDisplayName: reporter.displayName,
		reportedPartyDisplayName,
		targetType,
		targetId: row.targetId,
		targetLabel: targetLabel(targetType, reportedPartyDisplayName),
		reason: row.reason as ReportReason,
		reasonLabel: REPORT_REASON_LABELS[row.reason as ReportReason],
		freeText: row.freeText,
		createdAt: row.createdAt.toISOString(),
		queueAgeLabel: formatQueueAge(row.createdAt, now),
		overdue: isQueueAgeOverdue(row.createdAt, now),
		historySummary: historySummary(priorReports),
		priorReports,
		...content
	};
}

export async function listReportsQueue(db: Database, now: Date): Promise<ReportQueueItem[]> {
	const rows = await db
		.select()
		.from(reports)
		.where(eq(reports.status, 'open'))
		.orderBy(asc(reports.createdAt));

	const items: ReportQueueItem[] = [];
	for (const row of rows) {
		items.push(await mapReportRow(db, row, now));
	}
	return items;
}

export async function getReportsQueueStats(db: Database, now: Date): Promise<ReportsQueueStats> {
	const rows = await db
		.select({ createdAt: reports.createdAt })
		.from(reports)
		.where(eq(reports.status, 'open'));

	if (rows.length === 0) {
		return { openCount: 0, avgAgeHours: null, maxAgeHours: null };
	}

	const ages = rows.map((row) => queueAgeHours(row.createdAt, now));
	const total = ages.reduce((sum, age) => sum + age, 0);
	return {
		openCount: rows.length,
		avgAgeHours: total / rows.length,
		maxAgeHours: Math.max(...ages)
	};
}

export async function getReportContext(
	db: Database,
	reportId: ReportId,
	now: Date
): Promise<ReportQueueItem | null> {
	const rows = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
	const row = rows[0];
	if (!row) return null;
	return mapReportRow(db, row, now);
}

export async function findOpenReport(
	db: Database,
	reportId: ReportId
): Promise<typeof reports.$inferSelect | null> {
	const rows = await db
		.select()
		.from(reports)
		.where(and(eq(reports.id, reportId), eq(reports.status, 'open')))
		.limit(1);
	return rows[0] ?? null;
}

export async function countModerationActionsForTarget(
	db: Database,
	targetType: string,
	targetId: string
): Promise<number> {
	const rows = await db
		.select({ id: moderationActions.id })
		.from(moderationActions)
		.where(
			and(eq(moderationActions.targetType, targetType), eq(moderationActions.targetId, targetId))
		);
	return rows.length;
}
