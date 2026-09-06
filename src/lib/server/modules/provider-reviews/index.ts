import type { UserId } from '../../shared/ids';
import { asId, InvalidIdError, type ProviderProfileId } from '../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../shared/result';

export {
	listPublicReviewsForProvider,
	type ListPublicReviewsOptions,
	type ListPublicReviewsResult
} from './infra/list-public-reviews';
export { getReviewEligibility, getReviewEligibilityDto } from './infra/review-eligibility';
export { submitReview } from './infra/submit-review';
export {
	listReviewsWrittenBySeeker,
	countReviewsOnProfile,
	type SeekerReviewSummary
} from './infra/read-reviews';
export {
	abbreviateReviewerName,
	formatPublicReviewDate,
	toEligibility,
	toOwnReview,
	toPublicReview,
	type OwnReviewDto,
	type PublicReviewDto,
	type ReviewEligibilityDto
} from './infra/serializers';

export function parseProviderProfileId(raw: string): Result<ProviderProfileId, UseCaseError> {
	try {
		return Ok(asId<'ProviderProfileId'>(raw));
	} catch (error) {
		if (error instanceof InvalidIdError) {
			return Err({ kind: 'not_found', resource: 'provider_profile' });
		}
		throw error;
	}
}

export { handleModerationActionTaken as handleReviewsModeration } from './infra/moderation-subscriptions';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
