import type { UserId } from '../../shared/ids';
import {
	listReviewsWrittenBySeeker,
	countReviewsOnProfile,
	type SeekerReviewSummary
} from './infra/read-reviews';

export { listReviewsWrittenBySeeker, countReviewsOnProfile, type SeekerReviewSummary };

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
