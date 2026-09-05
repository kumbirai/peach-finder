import type { UserId } from '../../shared/ids';

export { getSafetyInfo } from './app/get-safety-info';
export { loadBadgeDisplayState, loadOwnerBadgeNotice } from './infra/badge-read';
export {
	BADGE_SUPPRESSION_REASON,
	handleIdentityAttributesChanged,
	handleBadgeFlagEvent
} from './infra/identity-change-subscription';
export { grantIdentityBadgeDev } from './infra/grant-badge-dev';

export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
