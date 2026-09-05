import { describe, expect, it } from 'vitest';
import { parseQuery } from './parse-query';

const DEEP_TISSUE_TAG = '01900000-0000-7000-8000-000000000201';

const lexicon = [
	{ term: 'zulu', entryType: 'language' as const, mapsTo: { language: 'zu' } },
	{ term: 'speaks zulu', entryType: 'language' as const, mapsTo: { language: 'zu' } },
	{
		term: 'deep tissue',
		entryType: 'service_term' as const,
		mapsTo: { serviceTagId: DEEP_TISSUE_TAG }
	},
	{
		term: 'available now',
		entryType: 'intent_availability' as const,
		mapsTo: { filter: 'available_now' }
	},
	{
		term: 'available tonight',
		entryType: 'intent_availability' as const,
		mapsTo: { filter: 'available_now' }
	},
	{ term: 'highly rated', entryType: 'intent_rating' as const, mapsTo: { filter: 'highly_rated' } },
	{ term: 'verified', entryType: 'intent_verification' as const, mapsTo: { filter: 'verified' } },
	{ term: 'near me', entryType: 'intent_proximity' as const, mapsTo: { filter: 'near_me' } }
];

const config = { highlyRatedMinAverage: 4.5, highlyRatedMinReviews: 3 };

describe('parseQuery', () => {
	it('parses language and availability intents from free text', () => {
		const sq = parseQuery('massage therapist who speaks zulu available now', lexicon, {}, config);
		expect(sq.languageCodes).toContain('zu');
		expect(sq.availableNow).toBe(true);
		expect(sq.freeText).toBe('');
	});

	it('merges manual filters', () => {
		const sq = parseQuery('', lexicon, { verified: true }, config);
		expect(sq.verified).toBe(true);
	});

	it('TC-DISC-02a: Massage therapist available now', () => {
		const sq = parseQuery('Massage therapist available now', lexicon, {}, config);
		expect(sq.availableNow).toBe(true);
		expect(sq.freeText).toBe('');
	});

	it('TC-DISC-02a: Deep tissue massage near me', () => {
		const sq = parseQuery('Deep tissue massage near me', lexicon, {}, config);
		expect(sq.serviceTagIds).toEqual([DEEP_TISSUE_TAG]);
		expect(sq.nearMe).toBe(true);
		expect(sq.freeText).toBe('');
	});

	it('TC-DISC-02a: Massage therapist available tonight maps to available now', () => {
		const sq = parseQuery('Massage therapist available tonight', lexicon, {}, config);
		expect(sq.availableNow).toBe(true);
		expect(sq.freeText).toBe('');
	});

	it('TC-DISC-02a: Highly rated massage therapist', () => {
		const sq = parseQuery('Highly rated massage therapist', lexicon, {}, config);
		expect(sq.minRating).toBe(4.5);
		expect(sq.minRatingCount).toBe(3);
		expect(sq.freeText).toBe('');
	});

	it('TC-DISC-02a: Massage therapist who speaks Zulu', () => {
		const sq = parseQuery('Massage therapist who speaks Zulu', lexicon, {}, config);
		expect(sq.languageCodes).toEqual(['zu']);
		expect(sq.freeText).toBe('');
	});

	it('TC-DISC-02b: identical parse for same query', () => {
		const a = parseQuery('Deep tissue massage near me', lexicon, {}, config);
		const b = parseQuery('Deep tissue massage near me', lexicon, {}, config);
		expect(a).toEqual(b);
	});

	it('TC-DISC-04: manual price and rating filters expose removable chip metadata', () => {
		const sq = parseQuery(
			'',
			lexicon,
			{ priceMax: 40_000, minRating: 4.8, languageCodes: ['zu'], verified: true },
			config
		);
		expect(sq.priceMax).toBe(40_000);
		expect(sq.minRating).toBe(4.8);
		expect(sq.minRatingCount).toBe(1);
		expect(sq.appliedIntents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'priceMax:40000', label: 'Under R400', source: 'manual' }),
				expect.objectContaining({ key: 'rating', source: 'manual' }),
				expect.objectContaining({ key: 'lang:zu', source: 'manual' }),
				expect.objectContaining({ key: 'verified', source: 'manual' })
			])
		);
	});

	it('TC-DISC-04: manual rating filter requires at least one review', () => {
		const sq = parseQuery('', lexicon, { minRating: 4 }, config);
		expect(sq.minRatingCount).toBe(1);
	});

	it('TC-DISC-04: manual rating keeps lexicon min review count when query already set rating', () => {
		const sq = parseQuery('highly rated massage therapist', lexicon, { minRating: 4.8 }, config);
		expect(sq.minRating).toBe(4.8);
		expect(sq.minRatingCount).toBe(3);
	});
});
