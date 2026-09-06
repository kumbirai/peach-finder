export const METRIC_DEFINITIONS = {
	profileView: 'A profile-page load by anyone other than you, counted once per viewer per day.',
	searchAppearance: 'Your card shown in a search or homepage results set someone viewed.',
	contactRequest:
		'A new message thread started with you, plus tap-to-call taps when your phone is visible.'
} as const;

export type DashboardRangeDays = 7 | 30 | 90;

export const DEFAULT_DASHBOARD_RANGE: DashboardRangeDays = 30;

export function parseDashboardRange(raw: string | null | undefined): DashboardRangeDays {
	if (raw === '7' || raw === '30' || raw === '90') {
		return Number(raw) as DashboardRangeDays;
	}
	return DEFAULT_DASHBOARD_RANGE;
}
