import type { Database } from '../../../db';
import { getOwnedProfileIdDb } from '../../provider-profile';
import type { UserId } from '../../../shared/ids';
import { listServiceTagIdsForProfileDb } from '../../provider-profile/infra/read-owner-profile';
import type { DashboardRangeDays } from '../domain/metric-definitions';
import { computeDashboardMetrics } from '../infra/dashboard-read';

export async function getDashboardForOwner(
	db: Database,
	ownerId: UserId,
	rangeDays: DashboardRangeDays,
	now = new Date()
) {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) return null;

	const tagIds = await listServiceTagIdsForProfileDb(db, profileId);
	return computeDashboardMetrics(db, profileId, rangeDays, now, new Set(tagIds));
}
