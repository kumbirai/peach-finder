import type { SearchUrlState } from '$lib/search-url';

export type ManualFilterChip =
	| { kind: 'verified'; label: string }
	| { kind: 'priceMax'; label: string; cents: number }
	| { kind: 'minRating'; label: string; value: number }
	| { kind: 'lang'; label: string; code: string };

/** Quick-filter chips on the discover surface — matches the interactive prototype. */
export const DISCOVERY_MANUAL_FILTER_CHIPS: ManualFilterChip[] = [
	{ kind: 'verified', label: 'Verified only' },
	{ kind: 'priceMax', label: 'Under R400', cents: 40_000 },
	{ kind: 'minRating', label: '4.8+ rated', value: 4.8 },
	{ kind: 'lang', label: 'Speaks isiZulu', code: 'zu' }
];

export function manualFilterIntentKey(chip: ManualFilterChip): string {
	switch (chip.kind) {
		case 'verified':
			return 'verified';
		case 'priceMax':
			return `priceMax:${chip.cents}`;
		case 'minRating':
			return 'rating';
		case 'lang':
			return `lang:${chip.code}`;
	}
}

export function isManualFilterActive(chip: ManualFilterChip, state: SearchUrlState): boolean {
	switch (chip.kind) {
		case 'verified':
			return state.verified;
		case 'priceMax':
			return state.priceMax === chip.cents;
		case 'minRating':
			return state.minRating === chip.value && state.minReviews == null;
		case 'lang':
			return state.langs.includes(chip.code);
	}
}

export function toggleManualFilter(chip: ManualFilterChip, state: SearchUrlState): SearchUrlState {
	const next: SearchUrlState = {
		...state,
		langs: [...state.langs],
		tags: [...state.tags]
	};
	switch (chip.kind) {
		case 'verified':
			next.verified = !state.verified;
			break;
		case 'priceMax':
			next.priceMax = state.priceMax === chip.cents ? null : chip.cents;
			break;
		case 'minRating':
			if (state.minRating === chip.value && state.minReviews == null) {
				next.minRating = null;
				next.minReviews = null;
			} else {
				next.minRating = chip.value;
				next.minReviews = null;
			}
			break;
		case 'lang':
			if (state.langs.includes(chip.code)) {
				next.langs = state.langs.filter((code) => code !== chip.code);
			} else {
				next.langs = [...state.langs, chip.code];
			}
			break;
	}
	return next;
}
