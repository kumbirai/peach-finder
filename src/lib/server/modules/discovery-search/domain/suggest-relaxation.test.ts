import { describe, expect, it } from 'vitest';
import { parseQuery } from './parse-query';
import { suggestRelaxation } from './suggest-relaxation';

const DEEP_TISSUE_TAG = '01900000-0000-7000-8000-000000000201';

const lexicon = [
	{ term: 'zulu', entryType: 'language' as const, mapsTo: { language: 'zu' } },
	{
		term: 'deep tissue',
		entryType: 'service_term' as const,
		mapsTo: { serviceTagId: DEEP_TISSUE_TAG }
	}
];

const config = { highlyRatedMinAverage: 4.5, highlyRatedMinReviews: 3 };

describe('suggestRelaxation', () => {
	it('TC-DISC-07a: available_now is relaxed before verified and language', () => {
		const sq = parseQuery(
			'',
			lexicon,
			{
				availableNow: true,
				verified: true,
				languageCodes: ['zu'],
				minRating: 4.8
			},
			config
		);
		const suggestion = suggestRelaxation(sq);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.intentKey).toBe('available');
		expect(suggestion?.actionLabel).toContain('Available now');
	});

	it('pins rating before verified when available_now is absent', () => {
		const sq = parseQuery(
			'',
			lexicon,
			{ verified: true, minRating: 4.8, languageCodes: ['zu'] },
			config
		);
		expect(suggestRelaxation(sq)?.intentKey).toBe('rating');
	});

	it('pins near_me before price band', () => {
		const sq = parseQuery('', lexicon, { nearMe: true, priceMax: 40_000, verified: true }, config);
		expect(suggestRelaxation(sq)?.intentKey).toBe('near');
		expect(suggestRelaxation(sq)?.actionLabel).toBe('Widen area');
	});

	it('pins priceMax before verified', () => {
		const sq = parseQuery('', lexicon, { priceMax: 40_000, verified: true }, config);
		expect(suggestRelaxation(sq)?.intentKey).toBe('priceMax:40000');
	});

	it('pins language before service_tag', () => {
		const sq = parseQuery(
			'',
			lexicon,
			{ languageCodes: ['zu'], serviceTagIds: [DEEP_TISSUE_TAG] },
			config
		);
		expect(suggestRelaxation(sq)?.intentKey).toBe('lang:zu');
	});

	it('returns null when no structured filters are present', () => {
		const sq = parseQuery('massage therapist', lexicon, {}, config);
		expect(suggestRelaxation(sq)).toBeNull();
	});

	it('is deterministic for identical StructuredQuery inputs', () => {
		const sq = parseQuery(
			'',
			lexicon,
			{ availableNow: true, verified: true, priceMax: 40_000 },
			config
		);
		expect(suggestRelaxation(sq)).toEqual(suggestRelaxation(sq));
	});
});
