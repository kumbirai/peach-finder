import type { Database } from '../../../db';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import { bucketSpec, consumeRateLimit } from '../../../shared/rate-limit';
import type { Result, UseCaseError } from '../../../shared/result';
import { threadExistsForSeekerProvider } from './messaging-commands';

/** Apply thread_create (first contact only) then message_send before sending. */
export async function applyMessagingRateLimitsBeforeSend(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<Result<void, UseCaseError>> {
	const hasThread = await threadExistsForSeekerProvider(db, seekerId, providerProfileId);
	if (!hasThread) {
		const threadLimited = await consumeRateLimit(
			db,
			bucketSpec('thread_create'),
			`account:${seekerId}`,
			now
		);
		if (!threadLimited.ok) return threadLimited;
	}

	return consumeRateLimit(db, bucketSpec('message_send'), `account:${seekerId}`, now);
}
