import type { UserId } from '../../shared/ids';
import {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	listSeekerThreads,
	listProviderInbox,
	validateMessageBody,
	canSeekerMessageProvider,
	threadExistsForSeekerProvider,
	sendMessageInThread,
	type SendOrHoldResult,
	type ThreadSummary
} from './infra/messaging-commands';
import { getDevMessageState } from './infra/dev-message-state';
import { getPresence, getResponseTime, hasSentSince } from './infra/presence-read';
import { upsertPresenceHeartbeat } from './infra/presence-heartbeat';

export {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	listSeekerThreads,
	listProviderInbox,
	validateMessageBody,
	canSeekerMessageProvider,
	threadExistsForSeekerProvider,
	sendMessageInThread,
	getDevMessageState,
	getPresence,
	getResponseTime,
	hasSentSince,
	upsertPresenceHeartbeat,
	type SendOrHoldResult,
	type ThreadSummary
};
export type { PresenceBucket } from './domain/presence-buckets';
export type { ResponseTimeBucket } from './domain/response-time-bucket';
export {
	handleEmailVerified,
	handleAccountDeletionRequested,
	handleUserBlocked,
	handleUserUnblocked
} from './infra/subscriptions';
export {
	countTotalUnreadForSeeker,
	countTotalUnreadForProviderOwner,
	areMessagesStillUnreadByRecipient,
	getThreadIdForMessage
} from './infra/unread-queries';
export {
	listThreadMessages,
	pollThreadMessages,
	markThreadReadUpTo,
	getThreadHeader
} from './infra/messaging-queries';
export { resolveThreadAccess } from './infra/thread-access';
export { getThreadForReport, isThreadParticipant } from './infra/thread-for-report';
export {
	listThreadMessagesForReport,
	type ReportThreadMessage
} from './infra/thread-messages-for-report';
export type { MessageDTO, ThreadListItemDTO } from './infra/serializers';
export { toThreadListItem } from './infra/serializers';

export { hasEligibleThread, getThreadCreatedAtForPair } from './infra/thread-eligibility';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
