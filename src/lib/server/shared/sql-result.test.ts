import { describe, expect, it } from 'vitest';
import { queryRows, affectedCount } from './sql-result';

describe('sql-result helpers', () => {
	it('reads array results', () => {
		expect(queryRows([{ count: 2 }])[0]?.count).toBe(2);
	});

	it('reads { rows } envelopes', () => {
		expect(queryRows({ rows: [{ id: 'a' }] })[0]?.id).toBe('a');
	});

	it('reads affected counts', () => {
		expect(affectedCount({ count: 3 })).toBe(3);
		expect(affectedCount([])).toBe(0);
	});
});
