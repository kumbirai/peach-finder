import type { Database } from '../../../db';
import { getThreadCreatedAtForPair } from '../../direct-messaging/infra/thread-eligibility';
import type { ProviderProfileId, UserId } from '../../../shared/ids';
import {
	resolveReviewEligibility,
	REVIEW_MIN_AGE_HOURS,
	threadAgeMs,
	type ReviewEligibilityState
} from '../domain/eligibility';
import { seekerHasReviewForProvider } from './review-queries';
import { toEligibility } from './serializers';

export async function getReviewEligibility(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<ReviewEligibilityState> {
	const [createdAt, alreadyReviewed] = await Promise.all([
		getThreadCreatedAtForPair(db, seekerId, providerProfileId),
		seekerHasReviewForProvider(db, seekerId, providerProfileId)
	]);

	return resolveReviewEligibility({
		hasThread: createdAt != null,
		threadAgeMs: createdAt ? threadAgeMs(createdAt, now) : null,
		alreadyReviewed,
		minAgeHours: REVIEW_MIN_AGE_HOURS,
		now
	});
}

export async function getReviewEligibilityDto(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId,
	now: Date
) {
	return toEligibility(await getReviewEligibility(db, seekerId, providerProfileId, now));
}
