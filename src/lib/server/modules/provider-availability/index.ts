import type { UserId } from '../../shared/ids';

export {
	setAvailabilityForOwner,
	clearAvailabilityForOwner,
	getAvailabilityStatusForOwner,
	getAvailabilityTransparencyForOwner,
	getRecentActivityCount,
	listAvailabilityAnnotationEvents,
	loadAvailabilityStatus,
	toAvailabilityStatusDto,
	type AvailabilityStatusDto,
	type ActiveThisWeekTransparencyDto,
	type AvailabilityTransparencyDto,
	type AvailabilityAnnotationEvent
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
