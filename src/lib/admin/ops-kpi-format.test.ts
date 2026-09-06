import { describe, expect, it } from 'vitest';
import { queueAgeSubLabel } from './ops-kpi-format';

describe('ops-kpi-format', () => {
	it('formats queue age in hours when under one day', () => {
		expect(queueAgeSubLabel(5.2, 'empty')).toBe('avg age 5 hours');
	});

	it('formats queue age in days when at least one day', () => {
		expect(queueAgeSubLabel(48, 'empty')).toBe('avg age 2 days');
	});

	it('returns empty label when there is no queue depth', () => {
		expect(queueAgeSubLabel(null, 'no pending cases')).toBe('no pending cases');
	});
});
