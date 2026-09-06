export { getDashboardForOwner } from './app/get-dashboard-for-owner';
export {
	captureView,
	captureAppearance,
	captureFilterUsage,
	captureContactRequest,
	captureTapToCall
} from './infra/capture';
export { deriveViewerKey, ANON_COOKIE } from './infra/viewer-key';
export { formatCount } from './infra/serializers';
export { handleThreadCreatedForAnalytics } from './infra/thread-created-subscription';
export {
	runAnalyticsMaintenanceTick,
	runHourlyAnalyticsRollup,
	purgeExpiredRawAnalyticsEvents
} from './infra/rollup-job';
export {
	parseDashboardRange,
	DEFAULT_DASHBOARD_RANGE,
	METRIC_DEFINITIONS
} from './domain/metric-definitions';
export type {
	ProviderDashboardView,
	DashboardMetricView,
	MostSearchedServiceView
} from './infra/serializers';

import type { UserId } from '../../shared/ids';

/** Wave 0 stub — populated by later waves. */
export async function exportFor(_userId: UserId): Promise<Record<string, never>> {
	return {};
}
