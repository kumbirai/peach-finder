import { describe, expect, it } from 'vitest';
import {
	DISCOVERY_MANUAL_FILTER_CHIPS,
	isManualFilterActive,
	manualFilterIntentKey,
	toggleManualFilter
} from './manual-filters';
import type { SearchUrlState } from './search-url';

const emptyState = (): SearchUrlState => ({
	q: '',
	verified: false,
	available: false,
	langs: [],
	tags: [],
	minRating: null,
	minReviews: null,
	priceMin: null,
	priceMax: null,
	near: false,
	lat: null,
	lng: null,
	areaSlug: null
});

describe('manual-filters', () => {
	it('exposes the prototype quick-filter chips', () => {
		expect(DISCOVERY_MANUAL_FILTER_CHIPS.map((chip) => chip.label)).toEqual([
			'Verified only',
			'Under R400',
			'4.8+ rated',
			'Speaks isiZulu'
		]);
	});

	it('toggles verified, language, rating, and price filters independently', () => {
		let state = emptyState();
		state = toggleManualFilter(DISCOVERY_MANUAL_FILTER_CHIPS[0]!, state);
		expect(state.verified).toBe(true);

		state = toggleManualFilter(DISCOVERY_MANUAL_FILTER_CHIPS[3]!, state);
		expect(state.langs).toEqual(['zu']);

		state = toggleManualFilter(DISCOVERY_MANUAL_FILTER_CHIPS[2]!, state);
		expect(state.minRating).toBe(4.8);

		state = toggleManualFilter(DISCOVERY_MANUAL_FILTER_CHIPS[1]!, state);
		expect(state.priceMax).toBe(40_000);
	});

	it('maps chips to removable intent keys', () => {
		expect(manualFilterIntentKey(DISCOVERY_MANUAL_FILTER_CHIPS[1]!)).toBe('priceMax:40000');
		expect(
			isManualFilterActive(DISCOVERY_MANUAL_FILTER_CHIPS[1]!, {
				...emptyState(),
				priceMax: 40_000
			})
		).toBe(true);
	});

	it('does not mark manual rating chip active when highly rated review floor is set', () => {
		expect(
			isManualFilterActive(DISCOVERY_MANUAL_FILTER_CHIPS[2]!, {
				...emptyState(),
				minRating: 4.5,
				minReviews: 3
			})
		).toBe(false);
	});
});
