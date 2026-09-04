import type { UserId } from '../../shared/ids';
import {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	validateMessageBody,
	type SendOrHoldResult
} from './infra/messaging-commands';
import { getDevMessageState } from './infra/dev-message-state';

export {
	sendOrHoldMessage,
	releaseHeldMessagesForUser,
	getThreadForSeekerProvider,
	getPendingForSeekerProvider,
	validateMessageBody,
	getDevMessageState,
	type SendOrHoldResult
};
export { handleEmailVerified } from './infra/subscriptions';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
