import { describe, expect, it } from 'vitest';
import {
	isReportReason,
	isReportTargetType,
	REPORT_REASONS,
	REPORT_TARGET_TYPES
} from './report-taxonomy';

describe('report-taxonomy', () => {
	it('accepts the fixed FR-TRUST-07 target types', () => {
		for (const targetType of REPORT_TARGET_TYPES) {
			expect(isReportTargetType(targetType)).toBe(true);
		}
		expect(isReportTargetType('booking')).toBe(false);
	});

	it('accepts the fixed FR-TRUST-07 reasons', () => {
		for (const reason of REPORT_REASONS) {
			expect(isReportReason(reason)).toBe(true);
		}
		expect(isReportReason('abuse')).toBe(false);
	});
});
