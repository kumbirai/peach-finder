import type { AppliedIntent } from '$lib/types/discovery';
import {
	hasStructuredFilters,
	structuredQueryToParams,
	type SearchUrlState
} from '$lib/search-url';

export const RECENT_SEARCHES_STORAGE_KEY = 'pf_recent_searches';
export const MAX_RECENT_SEARCHES = 8;

export type RecentSearchEntry = {
	id: string;
	state: SearchUrlState;
	label: string;
	savedAt: string;
};

type StorageShape = RecentSearchEntry[];

function isSearchUrlState(value: unknown): value is SearchUrlState {
	if (!value || typeof value !== 'object') return false;
	const state = value as Record<string, unknown>;
	return (
		typeof state.q === 'string' &&
		typeof state.verified === 'boolean' &&
		typeof state.available === 'boolean' &&
		Array.isArray(state.langs) &&
		state.langs.every((lang) => typeof lang === 'string') &&
		Array.isArray(state.tags) &&
		state.tags.every((tag) => typeof tag === 'string') &&
		(state.minRating === null || typeof state.minRating === 'number') &&
		(state.minReviews === null || typeof state.minReviews === 'number') &&
		(state.priceMin === null || typeof state.priceMin === 'number') &&
		(state.priceMax === null || typeof state.priceMax === 'number') &&
		typeof state.near === 'boolean' &&
		(state.lat === null || typeof state.lat === 'number') &&
		(state.lng === null || typeof state.lng === 'number') &&
		(state.areaSlug === null || typeof state.areaSlug === 'string')
	);
}

function isRecentSearchEntry(value: unknown): value is RecentSearchEntry {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.id === 'string' &&
		isSearchUrlState(entry.state) &&
		typeof entry.label === 'string' &&
		typeof entry.savedAt === 'string'
	);
}

function parseStoredEntries(raw: string | null): RecentSearchEntry[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isRecentSearchEntry).slice(0, MAX_RECENT_SEARCHES);
	} catch {
		return [];
	}
}

function readStorage(): StorageShape {
	if (typeof localStorage === 'undefined') return [];
	return parseStoredEntries(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY));
}

function writeStorage(entries: StorageShape): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(
		RECENT_SEARCHES_STORAGE_KEY,
		JSON.stringify(entries.slice(0, MAX_RECENT_SEARCHES))
	);
}

export function isSaveableSearchState(state: SearchUrlState): boolean {
	return Boolean(state.q.trim()) || hasStructuredFilters(state);
}

export function stateFingerprint(state: SearchUrlState): string {
	return structuredQueryToParams(state).toString();
}

export function buildRecentSearchLabel(
	state: SearchUrlState,
	appliedIntents: AppliedIntent[] = []
): string {
	const q = state.q.trim();
	if (q) return q;

	const parts: string[] = [];
	for (const intent of appliedIntents) {
		if (parts.includes(intent.label)) continue;
		parts.push(intent.label);
	}
	if (state.verified && !parts.some((part) => /verified/i.test(part))) {
		parts.push('Verified only');
	}
	if (state.available && !parts.some((part) => /available/i.test(part))) {
		parts.push('Available now');
	}
	if (
		(state.near || state.lat != null || state.lng != null || state.areaSlug) &&
		!parts.some((part) => /near/i.test(part))
	) {
		parts.push('Near me');
	}
	if (state.minRating != null && !parts.some((part) => part.includes(String(state.minRating)))) {
		parts.push(`${state.minRating}+ rated`);
	}
	if (state.priceMax != null && !parts.some((part) => /under/i.test(part))) {
		parts.push(`Under R${Math.round(state.priceMax / 100)}`);
	}
	for (const lang of state.langs) {
		if (!parts.some((part) => part.toLowerCase().includes(lang.toLowerCase()))) {
			parts.push(lang);
		}
	}

	return parts.length > 0 ? parts.join(', ') : 'Search';
}

export function hrefForRecentSearch(entry: RecentSearchEntry): string {
	const params = structuredQueryToParams(entry.state);
	return params.toString() ? `/?${params.toString()}` : '/';
}

export function loadRecentSearches(): RecentSearchEntry[] {
	return readStorage();
}

export function saveRecentSearch(state: SearchUrlState, label: string): RecentSearchEntry[] {
	if (!isSaveableSearchState(state)) return readStorage();

	const fingerprint = stateFingerprint(state);
	const existing = readStorage().filter((entry) => stateFingerprint(entry.state) !== fingerprint);
	const next: RecentSearchEntry = {
		id:
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		state: {
			...state,
			langs: [...state.langs],
			tags: [...state.tags]
		},
		label: label.trim() || buildRecentSearchLabel(state),
		savedAt: new Date().toISOString()
	};
	const entries = [next, ...existing].slice(0, MAX_RECENT_SEARCHES);
	writeStorage(entries);
	return entries;
}

export function removeRecentSearch(id: string): RecentSearchEntry[] {
	const entries = readStorage().filter((entry) => entry.id !== id);
	writeStorage(entries);
	return entries;
}

export function clearRecentSearches(): void {
	writeStorage([]);
}
