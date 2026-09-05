export const REPORT_REASON_OPTIONS = [
	{ value: 'safety_concern', label: 'Safety concern' },
	{ value: 'fake_profile_photos', label: 'Fake profile or photos' },
	{ value: 'harassment', label: 'Harassment' },
	{ value: 'spam_scam', label: 'Spam or scam' },
	{ value: 'other', label: 'Other' }
] as const;

export type ReportReasonValue = (typeof REPORT_REASON_OPTIONS)[number]['value'];

export const PROFILE_REPORT_INTRO =
	'Reporting sends this profile to Peach Finder’s safety team. Blocking also stops future messages between you.';

export const PROFILE_REPORT_SUCCESS_COPY =
	'Report started. The safety team will review the relevant profile or conversation.';

export const THREAD_REPORT_SUCCESS_COPY =
	'Report started. The safety team will review this conversation.';

export function reportReasonLabels(): string[] {
	return REPORT_REASON_OPTIONS.map((option) => option.label);
}
