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

export {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	listSeekerThreads,
	listProviderInbox,
	validateMessageBody,
	getDevMessageState,
	type SendOrHoldResult,
	type ThreadSummary
};
export { handleEmailVerified } from './infra/subscriptions';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
