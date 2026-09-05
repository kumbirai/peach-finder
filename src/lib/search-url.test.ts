import { describe, expect, it } from 'vitest';
import {
	parseOptionalFiniteNumber,
	removeIntentFromState,
	structuredQueryToParams
} from './search-url';

describe('search-url', () => {
	it('parseOptionalFiniteNumber rejects non-numeric values', () => {
		expect(parseOptionalFiniteNumber(null)).toBeNull();
		expect(parseOptionalFiniteNumber('')).toBeNull();
		expect(parseOptionalFiniteNumber('notanumber')).toBeNull();
		expect(parseOptionalFiniteNumber('4.5')).toBe(4.5);
	});
	it('serializes structured search state to URL params', () => {
		const params = structuredQueryToParams({
			q: 'massage therapist',
			verified: false,
			available: true,
			langs: ['zu'],
			tags: ['tag-1'],
			minRating: 4.5,
			near: true
		});
		expect(params.get('q')).toBe('massage therapist');
		expect(params.get('available')).toBe('1');
		expect(params.getAll('lang')).toEqual(['zu']);
		expect(params.getAll('tag')).toEqual(['tag-1']);
		expect(params.get('minRating')).toBe('4.5');
		expect(params.get('near')).toBe('1');
	});

	it('removes a language intent chip from URL state', () => {
		const next = removeIntentFromState(
			{
				q: 'massage therapist',
				verified: false,
				available: false,
				langs: ['zu', 'en'],
				tags: [],
				minRating: null,
				near: false
			},
			'lang:zu'
		);
		expect(next.langs).toEqual(['en']);
	});
});
