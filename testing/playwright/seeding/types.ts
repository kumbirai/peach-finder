export type SeedPersonaRole = 'provider' | 'seeker';

export type SeedPersonaSpec = {
	key: string;
	role: SeedPersonaRole;
	displayName: string;
	password: string;
};

export type SeededPersona = {
	key: string;
	role: SeedPersonaRole;
	displayName: string;
	email: string;
	password: string;
	phone?: string;
	profileId?: string;
	userId?: string;
	completedJourneys: string[];
	partial: boolean;
};

export type SeedContext = {
	page: import('@playwright/test').Page;
	spec: SeedPersonaSpec;
	email: string;
	phone: string;
	partial: boolean;
	markPartial: (reason: string) => void;
};
