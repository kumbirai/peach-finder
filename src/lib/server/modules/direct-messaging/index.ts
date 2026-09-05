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

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
