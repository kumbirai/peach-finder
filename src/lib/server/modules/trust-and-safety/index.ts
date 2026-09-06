import type { UserId } from '../../shared/ids';

export { getSafetyInfo } from './app/get-safety-info';
export { fileReport } from './app/file-report';
export { blockUser } from './app/block-user';
export { unblockUser } from './app/unblock-user';
export { listBlocks } from './app/list-blocks';
export { loadBadgeDisplayState, loadOwnerBadgeNotice } from './infra/badge-read';
export {
	BADGE_SUPPRESSION_REASON,
	handleIdentityAttributesChanged,
	handleBadgeFlagEvent
} from './infra/identity-change-subscription';
export { grantIdentityBadgeDev } from './infra/grant-badge-dev';
export {
	runActiveThisWeekJob,
	evaluateActiveThisWeekSignals,
	type ActiveThisWeekJobResult
} from './infra/active-this-week-job';
export {
	runIdentityDocPurgeJob,
	type IdentityDocPurgeJobResult
} from './infra/identity-doc-purge-job';
export {
	ACTIVE_THIS_WEEK_WINDOW_MS,
	isActiveThisWeek,
	activeThisWeekWindowStart,
	type ActiveThisWeekSignals
} from './domain/active-this-week';
export {
	listIdentityQueue,
	getIdentityQueueStats,
	type IdentityQueueItem,
	type IdentityQueueStats
} from './infra/identity-queue-queries';
export {
	submitVerificationClaim,
	resubmitVerificationClaim,
	type VerificationCaseDto
} from './app/submit-verification-claim';
export { getOwnVerificationStatus } from './infra/verification-status-read';
export type { VerificationOwnerStatus, VerificationOwnerView } from './domain/verification-status';
export {
	approveVerification,
	rejectVerification,
	verificationCaseReferencesPhoto,
	type VerificationDecisionResult
} from './infra/verification-commands';
export {
	listReportsQueue,
	getReportsQueueStats,
	getReportContext,
	findOpenReport,
	countModerationActionsForTarget,
	type ReportQueueItem,
	type ReportsQueueStats,
	type ReportHistoryItem
} from './infra/reports-queue-queries';
export {
	dismissReport,
	actOnReport,
	type ReportResolutionResult,
	type ModerationActionKind
} from './infra/report-resolution-commands';
export {
	removePhoto,
	removeReview,
	unpublishProfile,
	suspendAccount,
	reinstateAccount,
	revokeBadge,
	type ModerationCommandResult
} from './infra/moderation-commands';
export {
	getAccountTrustSummary,
	type AccountReportHistoryItem,
	type AccountModerationHistoryItem,
	type AccountTrustSummary
} from './infra/account-lookup-queries';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
