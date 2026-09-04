export type SearchCard = {
	providerProfileId: string;
	displayName: string;
	photoUrl: string | null;
	availability: { state: 'available' | 'not_available'; setAt: string | null };
	rating: { average: number; count: number } | { state: 'new' };
	badges: { identityVerified: boolean; activeThisWeek: boolean };
	isFeatured: boolean;
	priceFromCents: number | null;
	areaName: string;
	distanceKm: number | null;
};

export type AppliedIntent = {
	key: string;
	label: string;
	source: string;
};
