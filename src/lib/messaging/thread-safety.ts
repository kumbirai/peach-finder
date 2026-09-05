import {
	REPORT_REASON_OPTIONS,
	THREAD_REPORT_SUCCESS_COPY as THREAD_REPORT_SUCCESS_COPY_SHARED
} from '$lib/safety/report-flow';

export const THREAD_SAFETY_INTRO =
	'Need help with this conversation? Reporting preserves the thread for review. Blocking stops new messages.';

export const THREAD_BLOCK_CONFIRM_COPY =
	'Block this person? You will no longer be able to message each other. You can undo this later in account settings.';

export const THREAD_REPORT_SUCCESS_COPY = THREAD_REPORT_SUCCESS_COPY_SHARED;

export const THREAD_BLOCK_SUCCESS_COPY =
	'Blocked. Neither person can send new messages to the other.';

export const THREAD_SAFETY_REASON_OPTIONS = REPORT_REASON_OPTIONS;

export type ThreadSafetyReason = (typeof THREAD_SAFETY_REASON_OPTIONS)[number]['value'];

export function threadSafetyPanelStateAfterMenuClose(): {
	panelCopy: typeof THREAD_SAFETY_INTRO;
	blockConfirming: boolean;
	choosingReason: boolean;
	busy: boolean;
	statusMessage: string;
	statusRole: 'status' | 'alert';
} {
	return {
		panelCopy: THREAD_SAFETY_INTRO,
		blockConfirming: false,
		choosingReason: false,
		busy: false,
		statusMessage: '',
		statusRole: 'status'
	};
}
