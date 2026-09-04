export const ANONYMIZED_DISPLAY_NAME = 'Deleted user';

export type UserPiiSnapshot = {
	email: string | null;
	phone: string | null;
	passwordHash: string | null;
	displayName: string;
};

export type AnonymizedUserFields = {
	email: null;
	emailVerifiedAt: null;
	phone: null;
	phoneVerifiedAt: null;
	passwordHash: null;
	displayName: typeof ANONYMIZED_DISPLAY_NAME;
	anonymizedAt: Date;
};

/** Phase-2 scrub: every directly-identifying field is null or the canonical tombstone. */
export function buildAnonymizedUserFields(now: Date): AnonymizedUserFields {
	return {
		email: null,
		emailVerifiedAt: null,
		phone: null,
		phoneVerifiedAt: null,
		passwordHash: null,
		displayName: ANONYMIZED_DISPLAY_NAME,
		anonymizedAt: now
	};
}

export function isPiiFullyScrubbed(fields: {
	email: string | null;
	phone: string | null;
	passwordHash: string | null;
	displayName: string;
}): boolean {
	return (
		fields.email === null &&
		fields.phone === null &&
		fields.passwordHash === null &&
		fields.displayName === ANONYMIZED_DISPLAY_NAME
	);
}
