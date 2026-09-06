import type { AuthContext } from '../../../shared/auth-context';
import { gatedActionHref } from '../../identity-and-access';
import { toRatingDisplay } from '../../provider-reviews';
import { resolveLanguageLabels } from '../domain/language-labels';

export type SearchCardRow = {
	providerProfileId: string;
	displayName: string;
	photoPrimaryUrl: string | null;
	introExtract: string;
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
	languageCodes: string[];
};

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

function messageHrefForCard(providerProfileId: string, viewer: AuthContext): string {
	if (viewer.hasRole('seeker')) {
		return `/messages/compose/${providerProfileId}`;
	}
	const profilePath = `/provider/${providerProfileId}`;
	return gatedActionHref('message', profilePath, providerProfileId);
}

export function toSearchCard(row: SearchCardRow, viewer: AuthContext): SearchCard {
	const rating = toRatingDisplay(row.ratingAverage, row.ratingCount);

	return {
		providerProfileId: row.providerProfileId,
		displayName: row.displayName,
		photoUrl: row.photoPrimaryUrl,
		introExtract: row.introExtract,
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
		distanceKm: row.distanceKm,
		languages: resolveLanguageLabels(row.languageCodes),
		messageHref: messageHrefForCard(row.providerProfileId, viewer)
	};
}
