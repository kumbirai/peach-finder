import type { AuthContext } from '../../../shared/auth-context';

export type SearchCardRow = {
	providerProfileId: string;
	displayName: string;
	photoPrimaryUrl: string | null;
	availabilityState: string;
	availabilitySetAt: Date | null;
	ratingAverage: string | null;
	ratingCount: number;
	badgeIdentityVerified: boolean;
	badgeActiveThisWeek: boolean;
	isFeatured: boolean;
	priceMinCents: number | null;
	areaName: string;
	distanceKm: number | null;
};

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

export type SuggestTermRow = {
	term: string;
	kind: string;
};

export type Suggestion = {
	term: string;
	kind: string;
};

export function toSuggestions(rows: SuggestTermRow[]): Suggestion[] {
	return rows.map((row) => ({ term: row.term, kind: row.kind }));
}

export function toSearchCard(row: SearchCardRow, _viewer: AuthContext): SearchCard {
	const rating =
		row.ratingCount === 0 || row.ratingAverage === null
			? { state: 'new' as const }
			: { average: Number(row.ratingAverage), count: row.ratingCount };

	return {
		providerProfileId: row.providerProfileId,
		displayName: row.displayName,
		photoUrl: row.photoPrimaryUrl,
		availability: {
			state: row.availabilityState === 'available' ? 'available' : 'not_available',
			setAt: row.availabilitySetAt?.toISOString() ?? null
		},
		rating,
		badges: {
			identityVerified: row.badgeIdentityVerified,
			activeThisWeek: row.badgeActiveThisWeek
		},
		isFeatured: row.isFeatured,
		priceFromCents: row.priceMinCents,
		areaName: row.areaName,
		distanceKm: row.distanceKm
	};
}
