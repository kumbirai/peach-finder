import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	RECENT_SEARCHES_STORAGE_KEY,
	buildRecentSearchLabel,
	clearRecentSearches,
	hrefForRecentSearch,
	isSaveableSearchState,
	loadRecentSearches,
	removeRecentSearch,
	saveRecentSearch,
	stateFingerprint
} from './recent-searches';

const sampleState = {
	q: 'massage therapist',
	verified: true,
	available: false,
	langs: ['zu'],
	tags: [],
	minRating: null,
	priceMin: null,
	priceMax: null,
	near: false,
	lat: null,
	lng: null,
	areaSlug: null
};

describe('recent-searches', () => {
	let storage: Record<string, string>;

	beforeEach(() => {
		storage = {};
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage[key] ?? null,
			setItem: (key: string, value: string) => {
				storage[key] = value;
			},
			removeItem: (key: string) => {
				delete storage[key];
			}
		});
		vi.stubGlobal('crypto', { randomUUID: () => 'test-id-1' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('isSaveableSearchState requires query text or structured filters', () => {
		expect(isSaveableSearchState(sampleState)).toBe(true);
		expect(
			isSaveableSearchState({
				...sampleState,
				q: '',
				verified: false,
				langs: []
			})
		).toBe(false);
	});

	it('saveRecentSearch persists first-party localStorage entries', () => {
		const entries = saveRecentSearch(sampleState, 'massage therapist');
		expect(entries).toHaveLength(1);
		expect(entries[0]?.label).toBe('massage therapist');
		expect(storage[RECENT_SEARCHES_STORAGE_KEY]).toContain('massage therapist');
		expect(loadRecentSearches()).toHaveLength(1);
	});

	it('deduplicates identical searches and moves the latest to the front', () => {
		saveRecentSearch(sampleState, 'massage therapist');
		vi.stubGlobal('crypto', { randomUUID: () => 'test-id-2' });
		saveRecentSearch(sampleState, 'massage therapist');
		const entries = loadRecentSearches();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toBe('test-id-2');
	});

	it('buildRecentSearchLabel falls back to filter labels when q is empty', () => {
		expect(
			buildRecentSearchLabel(
				{
					...sampleState,
					q: '',
					verified: true,
					available: true,
					langs: []
				},
				[{ key: 'verified', label: 'Verified only', source: 'manual' }]
			)
		).toBe('Verified only, Available now');
	});

	it('hrefForRecentSearch rebuilds the saved query and filters', () => {
		const [entry] = saveRecentSearch(sampleState, 'massage therapist');
		expect(entry).toBeDefined();
		expect(hrefForRecentSearch(entry!)).toBe('/?q=massage+therapist&verified=1&lang=zu');
	});

	it('removeRecentSearch and clearRecentSearches update storage', () => {
		saveRecentSearch(sampleState, 'massage therapist');
		const remaining = removeRecentSearch('test-id-1');
		expect(remaining).toEqual([]);
		saveRecentSearch(sampleState, 'massage therapist');
		clearRecentSearches();
		expect(loadRecentSearches()).toEqual([]);
	});

	it('stateFingerprint ignores object identity', () => {
		expect(stateFingerprint(sampleState)).toBe(stateFingerprint({ ...sampleState, langs: ['zu'] }));
	});
});
