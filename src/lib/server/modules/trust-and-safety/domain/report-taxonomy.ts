export const REPORT_TARGET_TYPES = ['profile', 'review', 'photo', 'thread'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
	'safety_concern',
	'fake_profile_photos',
	'harassment',
	'spam_scam',
	'other'
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	safety_concern: 'Safety concern',
	fake_profile_photos: 'Fake profile or photos',
	harassment: 'Harassment',
	spam_scam: 'Spam or scam',
	other: 'Other'
};

export function isReportTargetType(value: string): value is ReportTargetType {
	return (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function isReportReason(value: string): value is ReportReason {
	return (REPORT_REASONS as readonly string[]).includes(value);
}
