import type { AppliedIntent } from '$lib/types/discovery';

export type SearchUrlState = {
	q: string;
	verified: boolean;
	available: boolean;
	langs: string[];
	tags: string[];
	minRating: number | null;
	near: boolean;
};

export function parseOptionalFiniteNumber(raw: string | null): number | null {
	if (!raw) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

export function structuredQueryToParams(state: SearchUrlState): URLSearchParams {
	const params = new URLSearchParams();
	if (state.q) params.set('q', state.q);
	if (state.verified) params.set('verified', '1');
	if (state.available) params.set('available', '1');
	for (const lang of state.langs) params.append('lang', lang);
	for (const tag of state.tags) params.append('tag', tag);
	if (state.minRating != null) params.set('minRating', String(state.minRating));
	if (state.near) params.set('near', '1');
	return params;
}

export function removeIntentFromState(state: SearchUrlState, intentKey: string): SearchUrlState {
	const next = { ...state, langs: [...state.langs], tags: [...state.tags] };
	switch (intentKey) {
		case 'verified':
			next.verified = false;
			break;
		case 'available':
			next.available = false;
			break;
		case 'near':
			next.near = false;
			break;
		case 'rating':
			next.minRating = null;
			break;
		default:
			if (intentKey.startsWith('lang:')) {
				const code = intentKey.slice(5);
				next.langs = next.langs.filter((lang) => lang !== code);
			} else if (intentKey.startsWith('tag:')) {
				const id = intentKey.slice(4);
				next.tags = next.tags.filter((tag) => tag !== id);
			}
			break;
	}
	return next;
}

export function hasStructuredFilters(state: SearchUrlState): boolean {
	return (
		state.verified ||
		state.available ||
		state.langs.length > 0 ||
		state.tags.length > 0 ||
		state.minRating != null ||
		state.near
	);
}

export function hasQueryDerivedIntents(intents: AppliedIntent[]): boolean {
	return intents.some((intent) => intent.source === 'query');
}
