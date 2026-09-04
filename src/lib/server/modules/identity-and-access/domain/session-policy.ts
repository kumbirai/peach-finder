export const REAUTH_MAX_AGE_MS = 15 * 60_000;
export const PASSWORD_RESET_TTL_MS = 60 * 60_000;
export const SESSION_IDLE_MS = 90 * 24 * 60 * 60_000;

export function reauthIsValid(reauthAt: Date | null | undefined, now: Date): boolean {
	if (!reauthAt) return false;
	return now.getTime() - reauthAt.getTime() <= REAUTH_MAX_AGE_MS;
}
