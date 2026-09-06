import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { REPORT_REASON_LABELS, type ReportReason } from '../domain/report-taxonomy';
import { MODERATION_ACTION_KINDS, type ModerationActionKind } from '../domain/moderation-actions';
import { moderationActions, reports } from './schema';

export type AccountReportHistoryItem = {
	reportId: string;
	role: 'filed' | 'received';
	reasonLabel: string;
	status: 'open' | 'dismissed' | 'acted';
	createdAt: string;
};

export type AccountModerationHistoryItem = {
	moderationActionId: string;
	action: ModerationActionKind;
	actionLabel: string;
	reason: string;
	createdAt: string;
};

export type AccountTrustSummary = {
	openReportsCount: number;
	reportHistory: AccountReportHistoryItem[];
	moderationHistory: AccountModerationHistoryItem[];
	lastModerationLabel: string;
};

const MODERATION_ACTION_LABELS: Record<ModerationActionKind, string> = {
	remove_photo: 'Remove photo',
	remove_review: 'Remove review',
	unpublish: 'Unpublish profile',
	suspend: 'Suspend account',
	reinstate: 'Reinstate account',
	revoke_badge: 'Revoke identity badge'
};

function reportRole(
	row: typeof reports.$inferSelect,
	userId: UserId,
	providerProfileId: ProviderProfileId | null
): 'filed' | 'received' | null {
	if (row.reporterId === userId) return 'filed';
	if (providerProfileId && row.targetType === 'profile' && row.targetId === providerProfileId) {
		return 'received';
	}
	return null;
}

function reportScope(userId: UserId, providerProfileId: ProviderProfileId | null) {
	return or(
		eq(reports.reporterId, userId),
		providerProfileId
			? and(eq(reports.targetType, 'profile'), eq(reports.targetId, providerProfileId))
			: sql`false`
	);
}

function moderationTargets(userId: UserId, providerProfileId: ProviderProfileId | null) {
	const targets = [
		and(eq(moderationActions.targetType, 'user'), eq(moderationActions.targetId, userId))
	];
	if (providerProfileId) {
		targets.push(
			and(
				eq(moderationActions.targetType, 'profile'),
				eq(moderationActions.targetId, providerProfileId)
			)
		);
	}
	return or(...targets);
}

export async function getAccountTrustSummary(
	db: Database,
	userId: UserId,
	providerProfileId: ProviderProfileId | null
): Promise<AccountTrustSummary> {
	const scope = reportScope(userId, providerProfileId);

	const [openCountRows, reportRows] = await Promise.all([
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(reports)
			.where(and(eq(reports.status, 'open'), scope)),
		db.select().from(reports).where(scope).orderBy(desc(reports.createdAt)).limit(50)
	]);

	const openReportsCount = openCountRows[0]?.count ?? 0;
	const reportHistory: AccountReportHistoryItem[] = [];

	for (const row of reportRows) {
		const role = reportRole(row, userId, providerProfileId);
		if (!role) continue;
		reportHistory.push({
			reportId: row.id,
			role,
			reasonLabel: REPORT_REASON_LABELS[row.reason as ReportReason],
			status: row.status as AccountReportHistoryItem['status'],
			createdAt: row.createdAt.toISOString()
		});
	}

	const moderationRows = await db
		.select()
		.from(moderationActions)
		.where(moderationTargets(userId, providerProfileId))
		.orderBy(desc(moderationActions.createdAt))
		.limit(50);

	const moderationHistory: AccountModerationHistoryItem[] = moderationRows
		.filter((row) => MODERATION_ACTION_KINDS.includes(row.action as ModerationActionKind))
		.map((row) => {
			const action = row.action as ModerationActionKind;
			return {
				moderationActionId: row.id,
				action,
				actionLabel: MODERATION_ACTION_LABELS[action],
				reason: row.reason,
				createdAt: row.createdAt.toISOString()
			};
		});

	const lastModerationLabel =
		moderationHistory.length === 0
			? 'none'
			: `${moderationHistory[0]!.actionLabel} · ${new Date(
					moderationHistory[0]!.createdAt
				).toLocaleDateString('en-ZA')}`;

	return {
		openReportsCount,
		reportHistory,
		moderationHistory,
		lastModerationLabel
	};
}
