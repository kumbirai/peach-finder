export type PublicProfile = {
	id: string;
	displayName: string;
	intro: string;
	area: { name: string; slug: string } | null;
	services: Array<{
		id: string;
		name: string;
		description: string | null;
		durationMinutes: number;
		priceCents: number;
	}>;
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
