import type { AuthContext } from '../../../shared/auth-context';
import type { ProviderProfileId } from '../../../shared/ids';

export type PublicService = {
	id: string;
	name: string;
	description: string | null;
	durationMinutes: number;
	priceCents: number;
};

export type PublicProfile = {
	id: ProviderProfileId;
	displayName: string;
	intro: string;
	area: { name: string; slug: string } | null;
	services: PublicService[];
	tags: Array<{ id: string; name: string }>;
	languages: Array<{ code: string; name: string }>;
	photos: Array<{ id: string; url: string; isPrimary: boolean }>;
	badges: { identityVerified: boolean; activeThisWeek: boolean };
	rating: { average: number; count: number } | { state: 'new' };
	responseTime: string | null;
	onlineStatus: string | null;
	availability: { state: 'available' | 'not_available'; setAt: string | null };
	phone?: string;
	reviews: Array<{
		id: string;
		rating: number;
		body: string;
		reviewerName: string;
		createdAt: string;
	}>;
};

export type ProfileViewRow = {
	id: ProviderProfileId;
	ownerId: string;
	intro: string | null;
	phoneVisible: boolean;
	publishState: string;
	displayName: string;
	areaName: string | null;
	areaSlug: string | null;
	services: PublicService[];
	tags: Array<{ id: string; name: string }>;
	languages: Array<{ code: string; name: string }>;
	photos: Array<{ id: string; url: string; isPrimary: boolean }>;
	badges: { identityVerified: boolean; activeThisWeek: boolean };
	ratingAverage: string | null;
	ratingCount: number;
	responseTime: string | null;
	onlineStatus: string | null;
	availabilityState: string;
	availabilitySetAt: Date | null;
	phone: string | null;
	reviews: Array<{
		id: string;
		rating: number;
		body: string;
		reviewerId: string;
		reviewerName: string;
		createdAt: string;
	}>;
};

export function toPublicProfile(view: ProfileViewRow, viewer: AuthContext): PublicProfile {
	const includePhone = view.phone !== null && (view.phoneVisible || viewer.role !== 'anonymous');

	const rating =
		view.ratingCount === 0 || view.ratingAverage === null
			? { state: 'new' as const }
			: { average: Number(view.ratingAverage), count: view.ratingCount };

	return {
		id: view.id,
		displayName: view.displayName,
		intro: view.intro ?? '',
		area: view.areaName && view.areaSlug ? { name: view.areaName, slug: view.areaSlug } : null,
		services: view.services,
		tags: view.tags,
		languages: view.languages,
		photos: view.photos,
		badges: view.badges,
		rating,
		responseTime: view.responseTime,
		onlineStatus: view.onlineStatus,
		availability: {
			state: view.availabilityState === 'available' ? 'available' : 'not_available',
			setAt: view.availabilitySetAt?.toISOString() ?? null
		},
		...(includePhone ? { phone: view.phone! } : {}),
		reviews: view.reviews.map(({ reviewerId: _reviewerId, ...review }) => review)
	};
}
