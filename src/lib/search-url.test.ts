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
			minReviews: null,
			priceMin: null,
			priceMax: 40_000,
			near: true,
			lat: -26.1448,
			lng: 28.0416,
			areaSlug: null
		});
		expect(params.get('q')).toBe('massage therapist');
		expect(params.get('available')).toBe('1');
		expect(params.getAll('lang')).toEqual(['zu']);
		expect(params.getAll('tag')).toEqual(['tag-1']);
		expect(params.get('minRating')).toBe('4.5');
		expect(params.get('minReviews')).toBeNull();
		expect(params.get('priceMax')).toBe('40000');
		expect(params.get('near')).toBe('1');
		expect(params.get('lat')).toBe('-26.1448');
		expect(params.get('lng')).toBe('28.0416');
	});

	it('serializes minReviews when preserving highly rated threshold', () => {
		const params = structuredQueryToParams({
			q: '',
			verified: false,
			available: false,
			langs: [],
			tags: [],
			minRating: 4.5,
			minReviews: 3,
			priceMin: null,
			priceMax: null,
			near: false,
			lat: null,
			lng: null,
			areaSlug: null
		});
		expect(params.get('minRating')).toBe('4.5');
		expect(params.get('minReviews')).toBe('3');
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
				minReviews: null,
				priceMin: null,
				priceMax: null,
				near: false,
				lat: null,
				lng: null,
				areaSlug: null
			},
			'lang:zu'
		);
		expect(next.langs).toEqual(['en']);
	});

	it('removes a price-max intent chip from URL state', () => {
		const next = removeIntentFromState(
			{
				q: '',
				verified: false,
				available: false,
				langs: [],
				tags: [],
				minRating: null,
				minReviews: null,
				priceMin: null,
				priceMax: 40_000,
				near: false,
				lat: null,
				lng: null,
				areaSlug: null
			},
			'priceMax:40000'
		);
		expect(next.priceMax).toBeNull();
	});

	it('removes highly rated intent and clears review floor from URL state', () => {
		const next = removeIntentFromState(
			{
				q: '',
				verified: false,
				available: false,
				langs: [],
				tags: [],
				minRating: 4.5,
				minReviews: 3,
				priceMin: null,
				priceMax: null,
				near: false,
				lat: null,
				lng: null,
				areaSlug: null
			},
			'highlyRated'
		);
		expect(next.minRating).toBeNull();
		expect(next.minReviews).toBeNull();
	});

	it('removes near intent and clears proximity coordinates', () => {
		const next = removeIntentFromState(
			{
				q: '',
				verified: false,
				available: false,
				langs: [],
				tags: [],
				minRating: null,
				minReviews: null,
				priceMin: null,
				priceMax: null,
				near: true,
				lat: -26.1,
				lng: 28.0,
				areaSlug: 'rosebank'
			},
			'near'
		);
		expect(next.near).toBe(false);
		expect(next.lat).toBeNull();
		expect(next.lng).toBeNull();
		expect(next.areaSlug).toBeNull();
	});
});
