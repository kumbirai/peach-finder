export type AppliedIntent = {
	key: string;
	label: string;
	source: 'query' | 'manual';
};

export type StructuredQuery = {
	freeText: string;
	availableNow: boolean;
	verified: boolean;
	nearMe: boolean;
	minRating: number | null;
	minRatingCount: number;
	serviceTagIds: string[];
	languageCodes: string[];
	priceMin: number | null;
	priceMax: number | null;
	appliedIntents: AppliedIntent[];
};

export function emptyStructuredQuery(): StructuredQuery {
	return {
		freeText: '',
		availableNow: false,
		verified: false,
		nearMe: false,
		minRating: null,
		minRatingCount: 3,
		serviceTagIds: [],
		languageCodes: [],
		priceMin: null,
		priceMax: null,
		appliedIntents: []
	};
}
