import { describe, expect, it } from 'vitest';
import {
	THREAD_BLOCK_CONFIRM_COPY,
	THREAD_SAFETY_INTRO,
	THREAD_SAFETY_REASON_OPTIONS,
	threadSafetyPanelStateAfterMenuClose
} from './thread-safety';

describe('thread-safety copy', () => {
	it('intro explains reporting and blocking outcomes', () => {
		expect(THREAD_SAFETY_INTRO.toLowerCase()).toMatch(/report/);
		expect(THREAD_SAFETY_INTRO.toLowerCase()).toMatch(/block/);
	});

	it('block confirm mentions undo in account settings', () => {
		expect(THREAD_BLOCK_CONFIRM_COPY.toLowerCase()).toMatch(/undo/);
	});

	it('exposes every FR-TRUST-07 report reason for thread filing', () => {
		expect(THREAD_SAFETY_REASON_OPTIONS.map((option) => option.value)).toEqual([
			'safety_concern',
			'fake_profile_photos',
			'harassment',
			'spam_scam',
			'other'
		]);
	});

	it('resets panel state when the safety menu closes', () => {
		expect(threadSafetyPanelStateAfterMenuClose()).toEqual({
			panelCopy: THREAD_SAFETY_INTRO,
			blockConfirming: false,
			choosingReason: false,
			busy: false,
			statusMessage: '',
			statusRole: 'status'
		});
	});
});
