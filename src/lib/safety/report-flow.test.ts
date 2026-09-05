import { describe, expect, it } from 'vitest';
import { REPORT_REASON_OPTIONS, reportReasonLabels } from './report-flow';

describe('report-flow', () => {
	it('exposes every FR-TRUST-07 report reason for filing flows', () => {
		expect(REPORT_REASON_OPTIONS.map((option) => option.value)).toEqual([
			'safety_concern',
			'fake_profile_photos',
			'harassment',
			'spam_scam',
			'other'
		]);
	});

	it('maps reasons to human-readable labels only', () => {
		expect(reportReasonLabels()).toEqual([
			'Safety concern',
			'Fake profile or photos',
			'Harassment',
			'Spam or scam',
			'Other'
		]);
	});
});
