import { describe, expect, it } from 'vitest';
import { toSuggestions } from './serializers';

describe('toSuggestions', () => {
	it('returns term and kind only with no provider-name fields', () => {
		const rows = [
			{ term: 'deep tissue', kind: 'service' },
			{ term: 'rosebank', kind: 'area' }
		];
		const suggestions = toSuggestions(rows);
		expect(suggestions).toEqual([
			{ term: 'deep tissue', kind: 'service' },
			{ term: 'rosebank', kind: 'area' }
		]);
		for (const item of suggestions) {
			expect(Object.keys(item).sort()).toEqual(['kind', 'term']);
		}
	});
});
