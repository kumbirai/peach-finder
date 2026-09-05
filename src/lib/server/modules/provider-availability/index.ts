import type { UserId } from '../../shared/ids';

export {
	setAvailabilityForOwner,
	clearAvailabilityForOwner,
	getAvailabilityStatusForOwner,
	getRecentActivityCount,
	loadAvailabilityStatus,
	toAvailabilityStatusDto,
	type AvailabilityStatusDto
} from './infra/availability-commands';

export {
	runAvailabilityLifecycleTick,
	runAvailabilityWarningTick,
	runAvailabilityExpirySweep,
	type AvailabilityTickResult
} from './infra/availability-sweep';

export async function exportFor(userId: UserId): Promise<Record<string, never>> {
	void userId;
	return {};
}
