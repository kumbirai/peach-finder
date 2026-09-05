export type SearchCard = {
	providerProfileId: string;
	displayName: string;
	photoUrl: string | null;
	introExtract: string;
	availability: { state: 'available' | 'not_available'; setAt: string | null };
	rating: { average: number; count: number } | { state: 'new' };
	badges: { identityVerified: boolean; activeThisWeek: boolean };
	isFeatured: boolean;
	priceFromCents: number | null;
	areaName: string;
	distanceKm: number | null;
	languages: string[];
	messageHref: string;
};

export type AppliedIntent = {
	key: string;
	label: string;
	source: string;
};

export type Suggestion = {
	term: string;
	kind: string;
};

export type RelaxationSuggestion = {
	intentKey: string;
	filterLabel: string;
	actionLabel: string;
};
