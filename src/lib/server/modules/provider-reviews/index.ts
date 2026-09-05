import type { UserId } from '../../shared/ids';
import { asId, InvalidIdError, type ProviderProfileId } from '../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../shared/result';

export {
	listPublicReviewsForProvider,
	type ListPublicReviewsOptions,
	type ListPublicReviewsResult
} from './infra/list-public-reviews';
export {
	listReviewsWrittenBySeeker,
	countReviewsOnProfile,
	type SeekerReviewSummary
} from './infra/read-reviews';
export {
	abbreviateReviewerName,
	formatPublicReviewDate,
	toPublicReview,
	type PublicReviewDto
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

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
