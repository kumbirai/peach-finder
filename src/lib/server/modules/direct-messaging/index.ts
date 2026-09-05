import type { UserId } from '../../shared/ids';
import {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	listSeekerThreads,
	listProviderInbox,
	validateMessageBody,
	type SendOrHoldResult,
	type ThreadSummary
} from './infra/messaging-commands';
import { getDevMessageState } from './infra/dev-message-state';
import { getPresence, getResponseTime, hasSentSince } from './infra/presence-read';

export {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	listSeekerThreads,
	listProviderInbox,
	validateMessageBody,
	getDevMessageState,
	getPresence,
	getResponseTime,
	hasSentSince,
	type SendOrHoldResult,
	type ThreadSummary
};
export type { PresenceBucket } from './domain/presence-buckets';
export type { ResponseTimeBucket } from './domain/response-time-bucket';
export { handleEmailVerified, handleAccountDeletionRequested } from './infra/subscriptions';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
