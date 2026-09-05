import { describe, expect, it } from 'vitest';
import { formatIntroExtract } from './intro-extract';

describe('formatIntroExtract', () => {
	it('returns empty string for blank intro', () => {
		expect(formatIntroExtract('   ')).toBe('');
	});

	it('returns full intro when under the limit', () => {
		const intro = 'Deep tissue specialist helping you unwind after long work weeks.';
		expect(formatIntroExtract(intro)).toBe(intro);
	});

	it('truncates long intro on a word boundary with ellipsis', () => {
		const intro = `${'Licensed massage therapist. '.repeat(12)}`.trim();
		const extract = formatIntroExtract(intro, 80);
		expect(extract.length).toBeLessThanOrEqual(81);
		expect(extract.endsWith('…')).toBe(true);
	});
});
